import {
  LayoutDashboard,
  Plug,
  ClipboardList,
  LogOut,
  Shield,
  UploadCloud,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const items: Array<{
  title: string;
  url: string;
  icon: typeof ClipboardList;
  blocked?: boolean;
}> = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Integracoes", url: "/integrations", icon: Plug },
  { title: "Tarefas", url: "/tasks", icon: ClipboardList },
];

const adminItems = [
  { title: "Uploads", url: "/storage", icon: UploadCloud },
  { title: "Admin", url: "/admin", icon: Shield },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();
  const { toast } = useToast();

  const isAdmin = user ? user.role === "system_admin" || user.role === "tenant_admin" : false;

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="h-auto justify-center px-4 pb-5 pt-7">
            <img
              src="/logo_orygo_vetor.svg"
              alt="Orygo"
              className="h-9 w-auto object-contain"
            />
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-2">
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.blocked ? (
                    <SidebarMenuButton
                      isActive={false}
                      onClick={() =>
                        toast({
                          title: "Funcao Disponivel em Breve",
                        })
                      }
                      className="cursor-not-allowed opacity-60"
                      data-testid={`link-${item.title.toLowerCase()}`}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase()}`}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
              {isAdmin &&
                adminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={location === item.url}>
                      <Link href={item.url} data-testid={`link-${item.title.toLowerCase()}`}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground truncate">{user?.email}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            data-testid="button-logout"
            className="w-full"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
