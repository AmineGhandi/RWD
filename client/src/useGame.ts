import { useEffect, useRef, useState } from "react";
import {
  HubConnection,
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";
import type { Action, Room, Session } from "./types";
export function useGame(
  session: Session | null,
  onClosed?: (reason: string) => void,
) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connection, setConnection] = useState("connecting");
  const [error, setError] = useState("");
  const ref = useRef<HubConnection | null>(null);
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);
  useEffect(() => {
    setRoom(null);
    setError("");
    if (!session) return;
    let disposed = false;
    const hub = new HubConnectionBuilder()
      .withUrl("/game")
      .withAutomaticReconnect([0, 1000, 3000, 5000, 10000])
      .configureLogging(LogLevel.Error)
      .build();
    ref.current = hub;
    const attach = async () => {
      await hub.invoke("Attach", session.code, session.role, session.token);
      if (!disposed) {
        setConnection("connected");
        setError("");
      }
    };
    hub.on("State", (next: Room) => {
      if (!disposed)
        setRoom((old) => (!old || next.revision >= old.revision ? next : old));
    });
    hub.on("Closed", (reason: string) => {
      if (!disposed) {
        onClosedRef.current?.(reason);
      }
    });
    hub.onreconnecting(() => {
      if (!disposed) setConnection("reconnecting");
    });
    hub.onreconnected(() => {
      void attach().catch((e) => {
        if (!disposed) {
          setConnection("disconnected");
          setError(message(e));
        }
      });
    });
    hub.onclose(() => {
      if (!disposed) setConnection("disconnected");
    });
    const start = async () => {
      while (!disposed) {
        try {
          setConnection("connecting");
          await hub.start();
          if (disposed) {
            await hub.stop();
            return;
          }
          await attach();
          return;
        } catch (e) {
          if (disposed) return;
          setError(message(e));
          setConnection("disconnected");
          await hub.stop();
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    };
    void start();
    return () => {
      disposed = true;
      ref.current = null;
      void hub.stop();
    };
  }, [session]);
  async function act(action: Action) {
    if (!session || connection !== "connected") return;
    setError("");
    try {
      await ref.current!.invoke("Act", session.code, {
        ...action,
        roundId: room?.roundId,
        attemptId: room?.attemptId,
      });
    } catch (e) {
      setError(message(e));
      throw e;
    }
  }
  async function buzz() {
    if (!session || connection !== "connected" || !room) return;
    try {
      return await ref.current!.invoke<boolean>(
        "Buzz",
        session.code,
        room.roundId,
      );
    } catch (e) {
      setError(message(e));
    }
  }
  return { room, connection, error, setError, act, buzz };
}
function message(e: unknown) {
  const value =
    e instanceof Error ? e.message : "Something went wrong. Try again.";
  return value.replace(/^.*HubException: /, "");
}
