import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Falha no login");
      }

      const data = await res.json();
      login(data.user);
      toast({
        title: "Login realizado com sucesso!",
        description: `Bem-vindo, ${data.user.email}`,
      });
    } catch (error) {
      toast({
        title: "Erro no login",
        description: error instanceof Error ? error.message : "Credenciais inválidas",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Meta Ads Campaign Manager</CardTitle>
          <CardDescription>
            Entre com suas credenciais para acessar a plataforma
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-email"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-password"
                required
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              data-testid="button-login"
              disabled={isLoading}
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>

            {/* Aviso de consentimento + links exigidos pelo Meta */}
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Ao continuar, você concorda com nossos{" "}
              <a
                href="/terms.html"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:opacity-90"
              >
                Termos de Uso
              </a>{" "}
              e reconhece a{" "}
              <a
                href="/privacy.html"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:opacity-90"
              >
                Política de Privacidade
              </a>.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
