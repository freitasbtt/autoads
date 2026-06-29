"use client";

import { useMemo, useState } from "react";
import { Bug, Loader2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { DashboardCampaignsView } from "@/features/dashboard/components/DashboardCampaignsView";
import { DashboardFiltersCard } from "@/features/dashboard/components/DashboardFiltersCard";
import { FilterCombobox } from "@/features/dashboard/components/DashboardControls";
import { DashboardGoalsDialog } from "@/features/dashboard/components/DashboardGoalsDialog";
import { DashboardHeader } from "@/features/dashboard/components/DashboardHeader";
import { DashboardMacroView } from "@/features/dashboard/components/DashboardMacroView";
import { DashboardSyncPanel } from "@/features/dashboard/components/DashboardSyncPanel";
import { useDashboardController } from "@/features/dashboard/hooks/useDashboardController";
import type { DashboardProps } from "@/features/dashboard/types";

export default function Dashboard(props: DashboardProps = {}) {
  const controller = useDashboardController(props);
  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);
  const [selectedMetaAccountId, setSelectedMetaAccountId] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [sharePassword, setSharePassword] = useState("");

  const {
    isSharedMode,
    startDateStr,
    endDateStr,
    periodLabel,
    normalizedRange,
    setRawRange,
    selectedAccountIds,
    campaignFilter,
    campaignNameSearch,
    objectiveFilter,
    statusFilter,
    setCampaignFilter,
    setCampaignNameSearch,
    setObjectiveFilter,
    setStatusFilter,
    activeView,
    setActiveView,
    isSystemAdmin,
    showDebug,
    setShowDebug,
    isGoalsDialogOpen,
    setIsGoalsDialogOpen,
    accountOptions,
    syncCandidateOptions,
    addMetaAccountPendingId,
    addMetaAccount,
    campaignOptions,
    objectiveOptions,
    statusOptions,
    activeFilterChips,
    hasActiveFilters,
    hasPendingChanges,
    hasSelectedAccounts,
    accounts,
    syncAccounts,
    isSyncAccountsLoading,
    syncAccountPendingKey,
    enableSyncAccount,
    disableSyncAccount,
    isCreatingShareLink,
    createShareLink,
    metricsData,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    topCreativesByAccount,
    isTopCreativesLoading,
    isTopCreativesFetching,
    isTopCreativesError,
    topCreativesError,
    refetchTopCreatives,
    loadingProgress,
    loadingStatusLabel,
    kpis,
    timelineData,
    leadsByAccountData,
    spendByAccountData,
    funnelSteps,
    quickRanges,
    isGoalsLoading,
    goalsButtonLabel,
    isSavingGoals,
    saveGoals,
    applyQuickRange,
    applyFilters,
    sameRange,
    clearAllFilters,
    handleAccountsChange,
  } = controller;

  const isBlockingLoading =
    hasSelectedAccounts &&
    (isLoading || isFetching || isTopCreativesLoading || isTopCreativesFetching);

  const metaAccountOptions = useMemo(
    () => syncCandidateOptions,
    [syncCandidateOptions],
  );

  const handleMetaAccountSelect = (accountId: string | null) => {
    setSelectedMetaAccountId(accountId);
    if (!accountId) return;
    const account = metaAccountOptions.find((entry) => entry.value === accountId);
    if (!account) return;
    void addMetaAccount(account.value, account.label).finally(() => {
      setSelectedMetaAccountId(null);
    });
  };

  return (
    <>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(226,232,240,0.55),transparent_38%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))]">
        <div className="mx-auto w-full max-w-[1480px] space-y-6 px-4 py-5 sm:px-6 lg:px-8 xl:px-10">
          <div className="mx-auto w-full max-w-[1320px] space-y-6">
            <DashboardHeader
              isSharedMode={isSharedMode}
              isSystemAdmin={isSystemAdmin}
              showDebug={showDebug}
              onToggleDebug={() => setShowDebug((current) => !current)}
            />

            <DashboardFiltersCard
              isSharedMode={isSharedMode}
              periodLabel={periodLabel}
              hasSelectedAccounts={hasSelectedAccounts}
              kpis={kpis}
              normalizedRange={normalizedRange}
              quickRanges={quickRanges}
              selectedAccountIds={selectedAccountIds}
              campaignFilter={campaignFilter}
              campaignSearchTerm={campaignNameSearch}
              objectiveFilter={objectiveFilter}
              statusFilter={statusFilter}
              accountOptions={accountOptions}
              campaignOptions={campaignOptions}
              objectiveOptions={objectiveOptions}
              statusOptions={statusOptions}
              activeFilterChips={activeFilterChips}
              hasActiveFilters={hasActiveFilters}
              hasPendingChanges={hasPendingChanges}
              isApplyingFilters={isBlockingLoading}
              isDataError={isError || isTopCreativesError}
              isDataReady={hasSelectedAccounts && !!metricsData && !isError && !isBlockingLoading}
              goalsButtonLabel={goalsButtonLabel}
              isGoalsLoading={isGoalsLoading}
              isGoalsButtonDisabled={!hasSelectedAccounts || isGoalsLoading || hasPendingChanges}
              onRangeChange={setRawRange}
              onApplyQuickRange={applyQuickRange}
              onAccountsChange={handleAccountsChange}
              onOpenSyncModal={() => setIsSyncDialogOpen(true)}
              onOpenShareModal={() => setIsShareDialogOpen(true)}
              onCampaignChange={setCampaignFilter}
              onCampaignSearchTermChange={setCampaignNameSearch}
              onObjectiveChange={setObjectiveFilter}
              onStatusChange={setStatusFilter}
              onApplyFilters={applyFilters}
              onOpenGoals={() => setIsGoalsDialogOpen(true)}
              onClearAllFilters={clearAllFilters}
              sameRange={sameRange}
            />

            {isSharedMode ? (
              <div className="space-y-8">
                <DashboardMacroView
                  isSharedMode={isSharedMode}
                  hasSelectedAccounts={hasSelectedAccounts}
                  isLoading={isLoading}
                  isError={isError}
                  error={error}
                  metricsData={metricsData}
                  accounts={accounts}
                  timelineData={timelineData}
                  funnelSteps={funnelSteps}
                  leadsByAccountData={leadsByAccountData}
                  spendByAccountData={spendByAccountData}
                  onRetry={() => {
                    void refetch();
                  }}
                />

                <DashboardCampaignsView
                  isSharedMode={isSharedMode}
                  hasSelectedAccounts={hasSelectedAccounts}
                  isLoading={isLoading}
                  isError={isError}
                  error={error}
                  metricsData={metricsData}
                  accounts={accounts}
                  hasActiveFilters={hasActiveFilters}
                  onRetryMetrics={() => {
                    void refetch();
                  }}
                  topCreativesByAccount={topCreativesByAccount}
                  isTopCreativesLoading={isTopCreativesLoading}
                  isTopCreativesFetching={isTopCreativesFetching}
                  isTopCreativesError={isTopCreativesError}
                  topCreativesError={topCreativesError}
                  onRetryTopCreatives={() => {
                    void refetchTopCreatives();
                  }}
                />
              </div>
            ) : (
              <Tabs
                value={activeView}
                onValueChange={(value) => setActiveView(value as "macro" | "campaigns")}
                className="w-full space-y-6 pt-2"
              >
                <TabsList className="inline-grid h-auto grid-cols-2 rounded-2xl border border-slate-200 bg-white/90 p-1 shadow-sm">
                  <TabsTrigger value="macro" className="rounded-xl px-5">
                    Macro
                  </TabsTrigger>
                  <TabsTrigger value="campaigns" className="rounded-xl px-5">
                    Campanhas
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="macro" className="mt-0">
                  <DashboardMacroView
                    isSharedMode={isSharedMode}
                    hasSelectedAccounts={hasSelectedAccounts}
                    isLoading={isLoading}
                    isError={isError}
                    error={error}
                    metricsData={metricsData}
                    accounts={accounts}
                    timelineData={timelineData}
                    funnelSteps={funnelSteps}
                    leadsByAccountData={leadsByAccountData}
                    spendByAccountData={spendByAccountData}
                    onRetry={() => {
                      void refetch();
                    }}
                  />
                </TabsContent>

                <TabsContent value="campaigns" className="mt-0">
                  <DashboardCampaignsView
                    isSharedMode={isSharedMode}
                    hasSelectedAccounts={hasSelectedAccounts}
                    isLoading={isLoading}
                    isError={isError}
                    error={error}
                    metricsData={metricsData}
                    accounts={accounts}
                    hasActiveFilters={hasActiveFilters}
                    onRetryMetrics={() => {
                      void refetch();
                    }}
                    topCreativesByAccount={topCreativesByAccount}
                    isTopCreativesLoading={isTopCreativesLoading}
                    isTopCreativesFetching={isTopCreativesFetching}
                    isTopCreativesError={isTopCreativesError}
                    topCreativesError={topCreativesError}
                    onRetryTopCreatives={() => {
                      void refetchTopCreatives();
                    }}
                  />
                </TabsContent>
              </Tabs>
            )}

            {isSystemAdmin && showDebug && (
              <Card className="rounded-[24px] border-dashed border-slate-300 bg-white/90 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.3)]">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm font-medium leading-tight">
                    <Bug className="h-4 w-4 text-muted-foreground" />
                    Debug / Payload cru
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[400px] overflow-auto rounded-xl bg-slate-50 p-4 text-xs leading-snug">
                    {JSON.stringify(
                      {
                        request: {
                          startDate: startDateStr,
                          endDate: endDateStr,
                          accountIds: selectedAccountIds,
                          campaignId: campaignFilter,
                          objective: objectiveFilter,
                          status: statusFilter,
                        },
                        response: metricsData ?? null,
                      },
                      null,
                      2,
                    )}
                  </pre>
                  <p className="pt-2 text-[0.7rem] leading-tight text-muted-foreground">
                    Esses dados vem direto da API interna ja agregada.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <DashboardGoalsDialog
        open={isGoalsDialogOpen}
        onOpenChange={setIsGoalsDialogOpen}
        periodLabel={periodLabel}
        accounts={accounts}
        isLoading={isGoalsLoading}
        isSaving={isSavingGoals}
        onSave={saveGoals}
      />

      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Criar link compartilhavel</DialogTitle>
            <DialogDescription>
              O link usa os filtros aplicados agora e exige senha para acesso publico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="password"
              placeholder="Senha do link"
              value={sharePassword}
              onChange={(event) => setSharePassword(event.target.value)}
            />
            <Button
              className="w-full"
              disabled={isCreatingShareLink || sharePassword.trim().length < 4}
              onClick={() => {
                void createShareLink(sharePassword.trim()).then(() => {
                  setSharePassword("");
                  setIsShareDialogOpen(false);
                });
              }}
            >
              {isCreatingShareLink && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar e copiar link
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSyncDialogOpen} onOpenChange={setIsSyncDialogOpen}>
        <DialogContent className="max-h-[86vh] max-w-[980px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sincronizar contas</DialogTitle>
            <DialogDescription>
              Selecione contas da integracao Meta e ligue o switch para iniciar a sincronizacao.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div>
              <div className="text-sm font-medium text-slate-950">Contas da integracao Meta</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Ao selecionar uma conta, ela entra na lista abaixo. O switch liga ou desliga o job.
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold text-slate-950">Adicionar conta a sincronizacao</div>
            {metaAccountOptions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
                Todas as contas da integracao ja foram adicionadas ou nenhuma conta foi importada pela integracao Meta.
              </div>
            ) : (
              <div className="flex items-end gap-3">
                <FilterCombobox
                  label="Conta de anuncio"
                  placeholder="Buscar conta da Meta"
                  emptyLabel="Nenhuma conta disponivel"
                  options={metaAccountOptions}
                  value={selectedMetaAccountId}
                  onChange={handleMetaAccountSelect}
                  testId="sync-meta-account"
                  className="flex-1"
                  disabled={!!addMetaAccountPendingId}
                />
                {addMetaAccountPendingId && (
                  <div className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adicionando
                  </div>
                )}
              </div>
            )}
          </div>

          {syncAccounts.length === 0 && !isSyncAccountsLoading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-muted-foreground">
              Nenhuma conta adicionada a sincronizacao ainda.
            </div>
          ) : (
            <DashboardSyncPanel
              accounts={syncAccounts}
              isLoading={isSyncAccountsLoading}
              pendingKey={syncAccountPendingKey}
              onEnable={enableSyncAccount}
              onDisable={disableSyncAccount}
            />
          )}
        </DialogContent>
      </Dialog>

      {isBlockingLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/22 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-sm rounded-[28px] border border-slate-200/80 bg-white/96 px-6 py-7 text-center shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-sky-600">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div className="mt-4 text-base font-semibold text-slate-950">
              Atualizando dashboard
            </div>
            <div className="mt-5 space-y-2 text-left">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span>{loadingStatusLabel}</span>
                <span>{loadingProgress}%</span>
              </div>
              <Progress
                value={loadingProgress}
                className="h-2.5 rounded-full bg-slate-200 [&>div]:bg-sky-600"
                aria-label={loadingStatusLabel}
              />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Aguarde o carregamento completo de metricas, graficos e criativos.
            </p>
          </div>
        </div>
      )}

    </>
  );
}
