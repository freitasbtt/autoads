import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";

export default function Onboarding() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-semibold">Configuracao Inicial</h1>
          <p className="text-muted-foreground">Conecte sua conta Meta para comecar.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Meta Ads</CardTitle>
                <CardDescription>Autorize o acesso via OAuth da Meta.</CardDescription>
              </div>
              <StatusBadge status="pending" />
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={() => { window.location.href = "/auth/meta"; }} data-testid="button-connect-meta">
              Conectar com Meta
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
