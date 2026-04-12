import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function MessageInput({
  actionsEnabled,
  activeTurnId,
  interruptPending,
  onInterrupt,
  onSendMessage,
  sendMessagePending,
  threadId
}: {
  actionsEnabled: boolean;
  activeTurnId: string | null;
  interruptPending: boolean;
  onInterrupt: (threadId: string, turnId: string) => Promise<void>;
  onSendMessage: (threadId: string, text: string) => Promise<boolean>;
  sendMessagePending: boolean;
  threadId: string;
}) {
  const [composerText, setComposerText] = useState("");

  return (
    <div className="sticky bottom-0 z-10 border-t border-white/6 bg-background/82 px-4 py-3 backdrop-blur-xl md:px-5">
      <form
        className="space-y-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (threadId.length === 0) return;

          void (async () => {
            const sent = await onSendMessage(threadId, composerText);
            if (sent) {
              setComposerText("");
            }
          })();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <Label className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground" htmlFor="thread-composer">
            Send a message
          </Label>
          {activeTurnId ? (
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-primary">
              Live thread
            </p>
          ) : null}
        </div>
        <Textarea
          className="border-0 bg-accent/82 font-mono text-sm leading-6 transition-shadow duration-200 placeholder:text-muted-foreground/45 focus-visible:ring-1 focus-visible:ring-primary/40"
          id="thread-composer"
          onChange={(event) => {
            setComposerText(event.target.value);
          }}
          placeholder="Steer the current thread, request a change, or answer with more context."
          rows={4}
          value={composerText}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            className="w-full sm:flex-1"
            disabled={!actionsEnabled || sendMessagePending || composerText.trim().length === 0}
            type="submit"
          >
            {sendMessagePending ? "Sending..." : "Send message"}
          </Button>
          {activeTurnId ? (
            <Button
              className="w-full sm:w-auto"
              disabled={!actionsEnabled || interruptPending}
              onClick={() => {
                void onInterrupt(threadId, activeTurnId);
              }}
              type="button"
              variant="outline"
            >
              {interruptPending ? "Interrupting..." : "Interrupt turn"}
            </Button>
          ) : null}
          <span className="self-center whitespace-nowrap font-mono text-[0.7rem] text-muted-foreground">
            {composerText.trim().length} chars
          </span>
        </div>
      </form>
    </div>
  );
}
