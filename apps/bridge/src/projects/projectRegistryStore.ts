import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface StoredProjectRecord {
  path: string;
  importedAt: number;
  updatedAt: number;
}

interface ProjectRegistryState {
  version: 1;
  projects: StoredProjectRecord[];
}

export interface ProjectRegistryRecord {
  path: string;
  importedAt: number;
  updatedAt: number;
}

export class ProjectRegistryStore {
  readonly #statePath: string;
  #state: ProjectRegistryState;

  constructor(statePath: string) {
    this.#statePath = statePath;
    this.#state = this.#load();
  }

  reload(): void {
    this.#state = this.#load();
  }

  listProjects(): ProjectRegistryRecord[] {
    return [...this.#state.projects]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((record) => ({ ...record }));
  }

  upsertProject(path: string, nowInSeconds: number): ProjectRegistryRecord {
    const existing = this.#state.projects.find(
      (record) => record.path === path,
    );
    const nextRecord: StoredProjectRecord = existing
      ? {
          ...existing,
          updatedAt: nowInSeconds,
        }
      : {
          path,
          importedAt: nowInSeconds,
          updatedAt: nowInSeconds,
        };

    this.#state = {
      version: 1,
      projects: [
        ...this.#state.projects.filter((record) => record.path !== path),
        nextRecord,
      ],
    };
    this.#save();
    return { ...nextRecord };
  }

  removeProject(path: string): boolean {
    const nextProjects = this.#state.projects.filter(
      (record) => record.path !== path,
    );
    if (nextProjects.length === this.#state.projects.length) {
      return false;
    }

    this.#state = {
      version: 1,
      projects: nextProjects,
    };
    this.#save();
    return true;
  }

  #load(): ProjectRegistryState {
    if (!existsSync(this.#statePath)) {
      const initialState: ProjectRegistryState = {
        version: 1,
        projects: [],
      };
      this.#writeState(initialState);
      return initialState;
    }

    const raw = readFileSync(this.#statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProjectRegistryState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.projects)) {
      throw new Error(`Invalid project registry state at ${this.#statePath}`);
    }

    return {
      version: 1,
      projects: parsed.projects
        .filter(
          (record): record is StoredProjectRecord =>
            typeof record?.path === 'string' &&
            typeof record.importedAt === 'number' &&
            typeof record.updatedAt === 'number',
        )
        .map((record) => ({ ...record })),
    };
  }

  #save(): void {
    this.#writeState(this.#state);
  }

  #writeState(state: ProjectRegistryState): void {
    mkdirSync(dirname(this.#statePath), { recursive: true });
    writeFileSync(
      this.#statePath,
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8',
    );
  }
}
