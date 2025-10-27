import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Dashboard from "@/pages/Dashboard";
import Resources from "@/pages/Resources";
import CampaignForm from "@/pages/CampaignForm";
import ExistingCampaignForm from "@/pages/ExistingCampaignForm";
import Campaigns from "@/pages/Campaigns";
import Audiences from "@/pages/Audiences";
import Integrations from "@/pages/Integrations";
import Onboarding from "@/pages/Onboarding";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/campaigns" component={Campaigns} />
      <Route path="/campaigns/new" component={CampaignForm} />
      <Route path="/campaigns/existing" component={ExistingCampaignForm} />
      <Route path="/audiences" component={Audiences} />
      <Route path="/resources" component={Resources} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/onboarding" component={Onboarding} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/register" component={Register} />
      <Route path="/login" component={Login} />
      <Route path="/" component={Login} />
    </Switch>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PublicRouter />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <h2 className="text-lg font-semibold">Meta Ads Campaign Manager</h2>
          </header>
          <main className="flex-1 overflow-auto">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppContent />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
