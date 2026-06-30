"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@shipflow/ui";
import { useTRPC } from "../../../../lib/trpc-react";

export default function NewWorkspacePage() {
  const router = useRouter();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const createWorkspace = useMutation(
    trpc.workspace.create.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.workspace.list.queryKey() });
        router.push("/dashboard");
      },
    })
  );

  function handleNameChange(value: string) {
    setName(value);
    setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || createWorkspace.isPending) return;
    createWorkspace.mutate({ name: name.trim() });
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Create Workspace
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up a new workspace for your team
        </p>
      </div>

      <Card className="border border-border bg-card">
        <CardHeader>
          <CardTitle className="font-display">Workspace Details</CardTitle>
          <CardDescription>
            Choose a name and URL for your new workspace
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input
                id="ws-name"
                placeholder="My Company"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                disabled={createWorkspace.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ws-slug">Workspace URL</Label>
              <div className="flex items-center gap-0">
                <span className="rounded-l-lg border border-r-0 border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  shipflow.ai/
                </span>
                <Input
                  id="ws-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="rounded-l-none"
                  placeholder="my-company"
                  disabled={createWorkspace.isPending}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This will be used in your workspace URL
              </p>
            </div>

            {createWorkspace.isError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">
                  {createWorkspace.error.message}
                </p>
              </div>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                className="w-full bg-brand-gradient text-primary-foreground transition-all hover:opacity-90"
                disabled={!name.trim() || createWorkspace.isPending}
              >
                {createWorkspace.isPending ? "Creating..." : "Create Workspace"}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
