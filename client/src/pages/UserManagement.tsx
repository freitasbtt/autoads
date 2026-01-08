import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import type { Tenant } from "@shared/schema";

type UserRole = "system_admin" | "tenant_admin" | "member";

interface AdminUser {
  id: number;
  email: string;
  role: UserRole;
  tenantId: number;
  tenantName: string | null;
  createdAt: string;
}

type FormState = {
  email: string;
  password: string;
  role: UserRole;
};

type CreateUserPayload = {
  email: string;
  password: string;
  role: UserRole;
  tenantId?: number;
  tenantName?: string;
};

type UpdateUserPayload = Partial<Omit<CreateUserPayload, "password">> & {
  password?: string;
};

const roleLabels: Record<UserRole, string> = {
  system_admin: "Admin do Sistema",
  tenant_admin: "Admin do Cliente",
  member: "Colaborador",
};

const roleBadgeVariants: Record<UserRole, "default" | "secondary" | "outline"> = {
  system_admin: "default",
  tenant_admin: "secondary",
  member: "outline",
};

async function throwIfNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(text);
  }
}

export default function UserManagement() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isSystemAdmin = currentUser?.role === "system_admin";
  const defaultRole: UserRole = isSystemAdmin ? "tenant_admin" : "member";

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [formData, setFormData] = useState<FormState>({
    email: "",
    password: "",
    role: defaultRole,
  });
  const [createTenantName, setCreateTenantName] = useState("");
  const [editTenantName, setEditTenantName] = useState("");
  const [selectedTenantFilter, setSelectedTenantFilter] = useState<string>("all");

  const roleOptions = useMemo<UserRole[]>(
    () => (isSystemAdmin ? ["system_admin", "tenant_admin", "member"] : ["tenant_admin", "member"]),
    [isSystemAdmin]
  );

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/admin/tenants"],
    enabled: isSystemAdmin,
  });

  const {
    data: users = [],
    isLoading,
  } = useQuery<AdminUser[]>({
    queryKey: ["adminUsers", isSystemAdmin ? selectedTenantFilter : currentUser?.tenantId ?? "self"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (isSystemAdmin && selectedTenantFilter !== "all") {
        params.set("tenantId", selectedTenantFilter);
      }
      const query = params.toString();
      const res = await fetch(`/api/admin/users${query ? `?${query}` : ""}`, {
        credentials: "include",
      });
      await throwIfNotOk(res);
      return await res.json();
    },
  });

  const resetForm = () => {
    setFormData({
      email: "",
      password: "",
      role: defaultRole,
    });
    setSelectedUser(null);
    setCreateTenantName("");
    setEditTenantName("");
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => apiRequest("POST", "/api/admin/users", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({
        title: "Usuario criado",
        description: "O usuario foi criado com sucesso.",
      });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar usuario",
        description: error?.message || "Nao foi possivel criar o usuario.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserPayload }) =>
      apiRequest("PATCH", `/api/admin/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({
        title: "Usuario atualizado",
        description: "O usuario foi atualizado com sucesso.",
      });
      setIsEditDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar usuario",
        description: error?.message || "Nao foi possivel atualizar o usuario.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      toast({
        title: "Usuario removido",
        description: "O usuario foi removido com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover usuario",
        description: error?.message || "Nao foi possivel remover o usuario.",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!formData.email || !formData.password) {
      toast({
        title: "Campos obrigatorios",
        description: "Email e senha sao obrigatorios.",
        variant: "destructive",
      });
      return;
    }

    const payload: CreateUserPayload = {
      email: formData.email,
      password: formData.password,
      role: formData.role,
    };

    if (isSystemAdmin) {
      const trimmed = createTenantName.trim();
      if (trimmed) {
        payload.tenantName = trimmed;
      }
    }

    createMutation.mutate(payload);
  };

  const handleEdit = (user: AdminUser) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      password: "",
      role: user.role,
    });
    setEditTenantName("");
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!selectedUser) return;

    if (!formData.email) {
      toast({
        title: "Email obrigatorio",
        description: "Informe um email valido.",
        variant: "destructive",
      });
      return;
    }

    const updates: UpdateUserPayload = {};
    if (formData.email !== selectedUser.email) updates.email = formData.email;
    if (formData.password) updates.password = formData.password;
    if (formData.role !== selectedUser.role) updates.role = formData.role;

    if (isSystemAdmin) {
      const trimmed = editTenantName.trim();
      if (trimmed) {
        updates.tenantName = trimmed;
      }
    }

    if (Object.keys(updates).length === 0) {
      toast({
        title: "Nenhuma alteracao",
        description: "Nenhum campo foi modificado.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({ id: selectedUser.id, data: updates });
  };

  const handleDelete = (userId: number) => {
    if (confirm("Tem certeza que deseja excluir este usuario?")) {
      deleteMutation.mutate(userId);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Gerenciamento de Usuarios</h2>
          <p className="text-muted-foreground">
            Administre contas de sistema e acesso por cliente
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {isSystemAdmin && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="tenant-filter" className="text-xs uppercase text-muted-foreground">
                Cliente
              </Label>
              <Select
                value={selectedTenantFilter}
                onValueChange={setSelectedTenantFilter}
              >
                <SelectTrigger id="tenant-filter" className="w-[220px]" data-testid="select-tenant-filter">
                  <SelectValue placeholder="Todos os clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={String(tenant.id)}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={openCreateDialog} data-testid="button-create-user">
            <Plus className="h-4 w-4 mr-2" />
            Novo Usuario
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Carregando usuarios...</p>
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">Nenhum usuario encontrado</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Usuarios ({users.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Permissao
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Cliente
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                      Criado em
                    </th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                      Acoes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b hover-elevate"
                      data-testid={`row-user-${user.id}`}
                    >
                      <td className="py-4 px-4 font-medium">{user.email}</td>
                      <td className="py-4 px-4">
                        <Badge variant={roleBadgeVariants[user.role]}>
                          {roleLabels[user.role]}
                        </Badge>
                      </td>
                      <td className="py-4 px-4 text-sm text-muted-foreground">
                        {user.tenantName ?? "Sem nome"}
                      </td>
                      <td className="py-4 px-4 text-sm text-muted-foreground">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleEdit(user)}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleDelete(user.id)}
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuario</DialogTitle>
            <DialogDescription>
              Crie um usuario para um cliente ou para o sistema
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="input-user-email"
                type="email"
                placeholder="usuario@exemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                data-testid="input-user-password"
                type="password"
                placeholder="Minimo 6 caracteres"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Permissao</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
              >
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {roleLabels[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isSystemAdmin && (
              <div className="space-y-2">
                <Label>Cliente (opcional)</Label>
                <Input
                  value={createTenantName}
                  onChange={(e) => setCreateTenantName(e.target.value)}
                  placeholder="Minha Empresa"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending ? "Criando..." : "Criar Usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              Atualize as informacoes do usuario
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                data-testid="input-edit-user-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">Nova senha (opcional)</Label>
              <Input
                id="edit-password"
                data-testid="input-edit-user-password"
                type="password"
                placeholder="Deixe em branco para manter a senha atual"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Permissao</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}
              >
                <SelectTrigger data-testid="select-edit-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {roleLabels[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isSystemAdmin && selectedUser && (
              <div className="space-y-2">
                <Label>Novo cliente (opcional)</Label>
                <Input
                  value={editTenantName}
                  onChange={(e) => setEditTenantName(e.target.value)}
                  placeholder="Minha Empresa"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending}
              data-testid="button-confirm-update"
            >
              {updateMutation.isPending ? "Salvando..." : "Salvar Alteracoes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
