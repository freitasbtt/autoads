"use client";

import { Bug, Loader2 } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignCreativesDialog } from "@/components/CampaignCreativesDialog";
import { DashboardCampaignsView } from "@/features/dashboard/components/DashboardCampaignsView";
import { DashboardFiltersCard } from "@/features/dashboard/components/DashboardFiltersCard";
import { DashboardGoalsDialog } from "@/features/dashboard/components/DashboardGoalsDialog";
import { DashboardHeader } from "@/features/dashboard/components/DashboardHeader";
import { DashboardMacroView } from "@/features/dashboard/components/DashboardMacroView";
import { useDashboardController } from "@/features/dashboard/hooks/useDashboardController";
import type { DashboardProps } from "@/features/dashboard/types";

export default function Dashboard(props: DashboardProps = {}) {
  const controller = useDashboardController(props);

  const {
    isSharedMode,
    startDateStr,
    endDateStr,
    periodLabel,
    shareMetadata,
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
    creativeDialogInfo,
    setCreativeDialogInfo,
    isSystemAdmin,
    showDebug,
    setShowDebug,
    isGoalsDialogOpen,
    setIsGoalsDialogOpen,
    accountOptions,
    campaignOptions,
    objectiveOptions,
    statusOptions,
    activeFilterChips,
    hasActiveFilters,
    hasPendingChanges,
    hasSelectedAccounts,
    accounts,
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
    campaignIndex,
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
    openCampaignCreatives,
    handleAccountsChange,
  } = controller;

  const isBlockingLoading =
    hasSelectedAccounts &&
    (isLoading || isFetching || isTopCreativesLoading || isTopCreativesFetching);

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
              shareMetadata={shareMetadata}
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
                  onOpenCampaignCreatives={openCampaignCreatives}
                  campaignIndex={campaignIndex}
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
                    onOpenCampaignCreatives={openCampaignCreatives}
                    campaignIndex={campaignIndex}
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

      <CampaignCreativesDialog
        open={!!creativeDialogInfo}
        onClose={() => setCreativeDialogInfo(null)}
        campaign={creativeDialogInfo?.campaign ?? null}
        account={creativeDialogInfo?.account ?? null}
        headerSnapshot={creativeDialogInfo?.header ?? null}
        startDate={startDateStr}
        endDate={endDateStr}
      />

      <DashboardGoalsDialog
        open={isGoalsDialogOpen}
        onOpenChange={setIsGoalsDialogOpen}
        periodLabel={periodLabel}
        accounts={accounts}
        isLoading={isGoalsLoading}
        isSaving={isSavingGoals}
        onSave={saveGoals}
      />

      {isBlockingLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/22 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-sm rounded-[28px] border border-slate-200/80 bg-white/96 px-6 py-7 text-center shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky-50 text-sky-600">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div className="mt-4 text-base font-semibold text-slate-950">
              Atualizando dashboard
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
