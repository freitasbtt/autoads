import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, tenantName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Falha no cadastro");
      }

      const data = await res.json();
      login(data.user);
      toast({
        title: "Cadastro realizado com sucesso!",
        description: `Bem-vindo, ${data.user.email}`,
      });
    } catch (error) {
      toast({
        title: "Erro no cadastro",
        description: error instanceof Error ? error.message : "Não foi possível criar a conta",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Criar Nova Conta</CardTitle>
          <CardDescription>Cadastre-se para começar a gerenciar suas campanhas</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenantName">Nome da Empresa</Label>
              <Input
                id="tenantName"
                type="text"
                placeholder="Minha Empresa"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                data-testid="input-tenant-name"
                required
                disabled={isLoading}
              />
            </div>
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-password"
                required
                disabled={isLoading}
                minLength={6}
              />
              <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
            </div>
            <Button type="submit" className="w-full" data-testid="button-register" disabled={isLoading}>
              {isLoading ? "Cadastrando..." : "Criar Conta"}
            </Button>
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Já tem uma conta? </span>
              <a href="/login" className="text-primary hover:underline" data-testid="link-login">
                Fazer login
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
