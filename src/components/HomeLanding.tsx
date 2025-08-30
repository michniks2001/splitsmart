"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setParticipantName } from "@/utils/participant";

export default function HomeLanding() {
  const router = useRouter();
  const [currency, setCurrency] = useState("USD");
  const [code, setCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function onCreateSession() {
    try {
      setError(null);
      setIsCreating(true);
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to create session");
      const sessionCode = json.session?.code as string;
      if (!sessionCode) throw new Error("Missing session code");
      router.push(`/s/${encodeURIComponent(sessionCode)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsCreating(false);
    }
  }

  function onJoin() {
    setError(null);
    setIsJoining(true);
    const c = code.trim().toUpperCase();
    if (!c) {
      setError("Enter a code to join");
      setIsJoining(false);
      return;
    }
    if (name.trim()) {
      try {
        setParticipantName(c, name.trim());
      } catch {
        // ignore storage errors
      }
    }
    router.push(`/s/${encodeURIComponent(c)}`);
  }

  return (
    <section className="w-full max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">SplitSmart AI</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Create a session to upload a receipt, split the bill, and pay securely.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
        <h2 className="text-lg font-semibold">Create a new session</h2>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <label className="flex flex-col text-sm">
            <span className="mb-1 text-neutral-600 dark:text-neutral-400">Currency</span>
            <input
              className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="USD"
              maxLength={3}
            />
          </label>
          <button
            onClick={onCreateSession}
            disabled={isCreating}
            className="rounded-md bg-black text-white dark:bg-white dark:text-black px-4 py-2 disabled:opacity-60"
          >
            {isCreating ? "Creating..." : "Create session"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
        <h2 className="text-lg font-semibold">Join an existing session</h2>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <label className="flex flex-col text-sm w-full">
            <span className="mb-1 text-neutral-600 dark:text-neutral-400">Your name</span>
            <input
              className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alice"
            />
          </label>
          <label className="flex flex-col text-sm w-full">
            <span className="mb-1 text-neutral-600 dark:text-neutral-400">Session code</span>
            <input
              className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 w-full"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. ABC123"
            />
          </label>
          <button
            onClick={onJoin}
            disabled={isJoining}
            className="rounded-md bg-neutral-800 text-white dark:bg-white dark:text-black px-4 py-2 disabled:opacity-60"
          >
            {isJoining ? "Joining..." : "Join"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
      )}
    </section>
  );
}
