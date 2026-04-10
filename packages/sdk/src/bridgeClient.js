export class BridgeClient {
    #baseUrl;
    #accessToken;
    constructor(config) {
        this.#baseUrl = config.baseUrl;
        this.#accessToken = config.accessToken ?? "";
    }
    listThreads(request = {}) {
        return this.#requestJson("/api/threads", {
            method: "GET"
        }, request.cursor !== undefined || request.limit !== undefined
            ? {
                ...(request.cursor !== undefined ? { cursor: request.cursor } : {}),
                ...(request.limit !== undefined ? { limit: String(request.limit) } : {})
            }
            : undefined);
    }
    readThread(threadId) {
        return this.#requestJson(`/api/threads/${encodeURIComponent(threadId)}`, { method: "GET" });
    }
    startThread(request = {}) {
        return this.#requestJson("/api/threads/start", {
            method: "POST",
            body: JSON.stringify(request),
            headers: {
                "Content-Type": "application/json"
            }
        });
    }
    startTurn(request) {
        return this.#requestJson("/api/turns/start", {
            method: "POST",
            body: JSON.stringify(request),
            headers: {
                "Content-Type": "application/json"
            }
        });
    }
    interruptTurn(request) {
        return this.#requestJson("/api/turns/interrupt", {
            method: "POST",
            body: JSON.stringify(request),
            headers: {
                "Content-Type": "application/json"
            }
        });
    }
    respondToRequest(request) {
        return this.#requestJson("/api/requests/respond", {
            method: "POST",
            body: JSON.stringify(request),
            headers: {
                "Content-Type": "application/json"
            }
        });
    }
    subscribeToThreadEvents(threadId, handlers) {
        const eventSource = new EventSource(this.#buildUrl("/api/events", {
            threadId
        }));
        eventSource.onmessage = (message) => {
            const payload = JSON.parse(message.data);
            if (payload.type === "connected") {
                return;
            }
            if (payload.type === "error") {
                handlers.onError(payload.message);
                return;
            }
            handlers.onEvent(payload);
        };
        eventSource.onerror = () => {
            handlers.onError("Bridge event stream disconnected");
        };
        return () => {
            eventSource.close();
        };
    }
    async #requestJson(path, init, searchParams) {
        const response = await fetch(this.#buildUrl(path, searchParams), init);
        if (!response.ok) {
            let message = `Bridge request failed with ${response.status}`;
            try {
                const payload = (await response.json());
                message = payload.error.message ?? message;
            }
            catch {
                // Ignore malformed error payloads.
            }
            throw new Error(message);
        }
        return (await response.json());
    }
    #buildUrl(path, searchParams) {
        const url = new URL(path, this.#baseUrl);
        if (this.#accessToken) {
            url.searchParams.set("access_token", this.#accessToken);
        }
        if (searchParams) {
            for (const [key, value] of Object.entries(searchParams)) {
                url.searchParams.set(key, value);
            }
        }
        return url.toString();
    }
}
