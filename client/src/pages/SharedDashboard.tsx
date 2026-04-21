"use client";

import Dashboard from "./Dashboard";

export default function SharedDashboard() {
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Link compartilhado invalido.
        </div>
      </div>
    );
  }

  return <Dashboard shareToken={token} readOnly />;
}
