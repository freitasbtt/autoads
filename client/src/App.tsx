import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import Resources from "@/pages/Resources";
import { CampaignsPage } from "@/features/campaigns";
import Audiences from "@/pages/Audiences";
import Integrations from "@/pages/Integrations";
import Onboarding from "@/pages/Onboarding";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import SharedDashboard from "@/pages/SharedDashboard";
import StoragePage from "@/pages/Storage";
import PublicStorageUpload from "@/pages/PublicStorageUpload";
import TasksPage from "@/pages/Tasks";
import TaskDetailPage from "@/pages/TaskDetail";
import TaskDistributionPage from "@/pages/TaskDistribution";
import TaskDistributionReviewPage from "@/pages/TaskDistributionReview";
import NotFound from "@/pages/not-found";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

function LandingRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    window.location.assign("/landing.html");
  }, [navigate]);
  return null;
}

function RouteRedirect({ to }: { to: string }) {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate(to);
  }, [navigate, to]);

  return null;
}

function PrivateRouter() {
  return (
    <Switch>
      <Route path="/">
        <RouteRedirect to="/tasks" />
      </Route>
      <Route path="/dashboard">
        <Dashboard />
      </Route>
      <Route path="/shared/dashboard" component={SharedDashboard} />
      <Route path="/campaigns" component={CampaignsPage} />
      <Route path="/audiences" component={Audiences} />
      <Route path="/resources" component={Resources} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/storage">
        <ProtectedRoute requiredRoles={["system_admin", "tenant_admin"]}>
          <StoragePage />
        </ProtectedRoute>
      </Route>
      <Route path="/tasks">
        <ProtectedRoute>
          <TasksPage />
        </ProtectedRoute>
      </Route>
      <Route path="/tasks/:id/distribution/review">
        {(params) => (
          <ProtectedRoute>
            <TaskDistributionReviewPage taskId={params.id} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tasks/:id/distribution">
        {(params) => (
          <ProtectedRoute>
            <TaskDistributionPage taskId={params.id} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/tasks/:id">
        {(params) => (
          <ProtectedRoute>
            <TaskDetailPage taskId={params.id} />
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/admin">
        <ProtectedRoute requiredRoles={["system_admin", "tenant_admin"]}>
          <Admin />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/shared/dashboard" component={SharedDashboard} />
      <Route path="/landing" component={LandingRedirect} />
      <Route path="/upload/:publicId">
        {(params) => <PublicStorageUpload publicId={params.publicId} />}
      </Route>
      <Route component={Login} />
    </Switch>
  );
}

function AppContent() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated && (location === "/login" || location === "/landing")) {
      navigate("/tasks");
    }
  }, [isAuthenticated, isLoading, location, navigate]);

  if (location.startsWith("/upload/")) {
    return <PublicRouter />;
  }

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
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between p-4 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <h2 className="text-lg font-semibold">Meta Ads Campaign Manager</h2>
          </header>
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <PrivateRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
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
