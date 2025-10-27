import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [metaStatus, setMetaStatus] = useState<"pending" | "connected" | "error">("pending");
  const [driveStatus, setDriveStatus] = useState<"pending" | "connected" | "error">("pending");
  const [isTesting, setIsTesting] = useState(false);

  const handleTestMeta = () => {
    setIsTesting(true);
    setTimeout(() => {
      setMetaStatus("connected");
      setIsTesting(false);
    }, 2000);
  };

  const handleTestDrive = () => {
    setIsTesting(true);
    setTimeout(() => {
      setDriveStatus("connected");
      setIsTesting(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Configuração Inicial</h1>
          <p className="text-muted-foreground">Configure suas integrações para começar</p>
        </div>

        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${currentStep >= 1 ? "border-primary bg-primary text-primary-foreground" : "border-muted"}`}>
              {currentStep > 1 ? <CheckCircle2 className="w-5 h-5" /> : <span>1</span>}
            </div>
            <div className={`w-24 h-0.5 ${currentStep >= 2 ? "bg-primary" : "bg-muted"}`} />
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${currentStep >= 2 ? "border-primary bg-primary text-primary-foreground" : "border-muted"}`}>
              {currentStep > 2 ? <CheckCircle2 className="w-5 h-5" /> : <span>2</span>}
            </div>
          </div>
        </div>

        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Meta Ads</CardTitle>
                  <CardDescription>Conecte sua conta Meta Ads</CardDescription>
                </div>
                <StatusBadge status={metaStatus} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="meta-token">Access Token *</Label>
                <Input id="meta-token" type="password" placeholder="EAAx..." data-testid="input-meta-token" />
              </div>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={handleTestMeta}
                  disabled={isTesting}
                  data-testid="button-test-meta"
                >
                  {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Testar Conexão
                </Button>
                <Button
                  onClick={() => setCurrentStep(2)}
                  disabled={metaStatus !== "connected"}
                  data-testid="button-next"
                >
                  Continuar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Google Drive</CardTitle>
                  <CardDescription>Conecte sua conta Google Drive</CardDescription>
                </div>
                <StatusBadge status={driveStatus} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="drive-folder">Pasta Padrão (ID) *</Label>
                <Input id="drive-folder" placeholder="1aBcDeFg..." data-testid="input-drive-folder" />
              </div>

              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setCurrentStep(1)} data-testid="button-back">
                  Voltar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestDrive}
                  disabled={isTesting}
                  data-testid="button-test-drive"
                >
                  {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Testar Conexão
                </Button>
                <Button
                  disabled={driveStatus !== "connected"}
                  data-testid="button-finish"
                  onClick={() => console.log("Onboarding complete")}
                >
                  Concluir
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
