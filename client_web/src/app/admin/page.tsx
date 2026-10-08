"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { RequireAuth } from "@/lib/auth/guards";
import { useTranslations } from "@/lib/settings/SettingsProvider";
import { SettingsMenu } from "@/components/SettingsMenu";
import { Button, Card, FormError } from "@/components/ui";
import type { AdminUser } from "@/lib/types";

// User administration

function AdminContent() {
  const { user } = useAuth();
  const t = useTranslations();

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Identifier of the account currently being changed, to disable its row */
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await api.admin.listUsers());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError && loadError.status === 403
          ? t.adminAccessDenied
          : t.loadingError
      );
    }
  }, [t]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function changeRole(target: AdminUser, role: "user" | "admin") {
    setPendingUserId(target.id);
    setError(null);
    try {
      await api.admin.setUserRole(target.id, role);
      await loadUsers();
    } catch (actionError) {
      // The server's own sentence is shown: it explains WHY the change was
      // refused the last administrator, your own account which a generic
      // message could not.
      setError(actionError instanceof ApiError ? actionError.message : t.loadingError);
    } finally {
      setPendingUserId(null);
    }
  }

  async function removeUser(target: AdminUser) {
    if (!window.confirm(`${t.confirmDelete}\n\n${target.email}`)) {
      return;
    }

    setPendingUserId(target.id);
    setError(null);
    try {
      await api.admin.deleteUser(target.id);
      await loadUsers();
    } catch (actionError) {
      setError(actionError instanceof ApiError ? actionError.message : t.loadingError);
    } finally {
      setPendingUserId(null);
    }
  }

  const accountCount = users?.length ?? 0;

  return (
    <main id="main-content" className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold text-white">{t.adminTitle}</h1>
          <p className="text-sm text-muted">{t.adminSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <SettingsMenu />
          <Link href="/dashboard" className="text-sm text-signal hover:underline">
            ← {t.backToDashboard}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        {error && <FormError message={error} />}

        {users === null && !error && <p className="text-sm text-muted">{t.loading}</p>}

        {users !== null && (
          <>
            <p className="mb-4 text-sm text-muted">
              {accountCount} {accountCount > 1 ? t.totalAccountsPlural : t.totalAccounts}
            </p>

            {accountCount === 0 ? (
              <Card>
                <p className="text-sm text-muted">{t.noAccounts}</p>
              </Card>
            ) : (
              <>
                {/*
                  A table on a wide screen, cards on a narrow one
                */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full border-collapse text-sm">
                    <caption className="sr-only">{t.adminTitle}</caption>
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                        <th scope="col" className="px-3 py-2">{t.accountEmail}</th>
                        <th scope="col" className="px-3 py-2">{t.accountRole}</th>
                        <th scope="col" className="px-3 py-2">{t.accountStatus}</th>
                        <th scope="col" className="px-3 py-2 text-right">{t.accountWidgets}</th>
                        <th scope="col" className="px-3 py-2 text-right">{t.accountServices}</th>
                        <th scope="col" className="px-3 py-2">{t.accountCreated}</th>
                        <th scope="col" className="px-3 py-2 text-right">{t.accountActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((account) => (
                        <tr key={account.id} className="border-b border-line/50">
                          <td className="px-3 py-2 text-white">
                            {account.email}
                            {account.id === user?.id && (
                              <span className="ml-2 rounded bg-raised px-1.5 py-0.5 text-xs text-muted">
                                {t.youBadge}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <RoleBadge role={account.role} t={t} />
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge isVerified={account.isVerified} t={t} />
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white">
                            {account.widgetCount}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white">
                            {account.linkedServiceCount}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {new Date(account.createdAt).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="px-3 py-2">
                            <RowActions
                              account={account}
                              isSelf={account.id === user?.id}
                              isPending={pendingUserId === account.id}
                              onChangeRole={changeRole}
                              onDelete={removeUser}
                              t={t}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="flex flex-col gap-3 md:hidden">
                  {users.map((account) => (
                    <li key={account.id}>
                      <Card>
                        <p className="mb-2 break-all font-medium text-white">
                          {account.email}
                          {account.id === user?.id && (
                            <span className="ml-2 rounded bg-raised px-1.5 py-0.5 text-xs text-muted">
                              {t.youBadge}
                            </span>
                          )}
                        </p>

                        <div className="mb-3 flex flex-wrap gap-2">
                          <RoleBadge role={account.role} t={t} />
                          <StatusBadge isVerified={account.isVerified} t={t} />
                        </div>

                        <dl className="mb-3 flex gap-6 text-sm">
                          <div>
                            <dt className="text-xs text-muted">{t.accountWidgets}</dt>
                            <dd className="font-mono text-white">{account.widgetCount}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{t.accountServices}</dt>
                            <dd className="font-mono text-white">{account.linkedServiceCount}</dd>
                          </div>
                          <div>
                            <dt className="text-xs text-muted">{t.accountCreated}</dt>
                            <dd className="text-white">
                              {new Date(account.createdAt).toLocaleDateString("fr-FR")}
                            </dd>
                          </div>
                        </dl>

                        <RowActions
                          account={account}
                          isSelf={account.id === user?.id}
                          isPending={pendingUserId === account.id}
                          onChangeRole={changeRole}
                          onDelete={removeUser}
                          t={t}
                        />
                      </Card>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function RoleBadge({ role, t }: { role: "user" | "admin"; t: ReturnType<typeof useTranslations> }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        role === "admin" ? "bg-signal/15 text-signal" : "bg-raised text-muted"
      }`}
    >
      {role === "admin" ? t.roleAdmin : t.roleUser}
    </span>
  );
}

function StatusBadge({
  isVerified,
  t,
}: {
  isVerified: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        isVerified ? "bg-pulse/15 text-pulse" : "bg-amber/15 text-amber"
      }`}
    >
      {isVerified ? t.statusVerified : t.statusUnverified}
    </span>
  );
}

/*
 The buttons of one row
 */
function RowActions({
  account,
  isSelf,
  isPending,
  onChangeRole,
  onDelete,
  t,
}: {
  account: AdminUser;
  isSelf: boolean;
  isPending: boolean;
  onChangeRole: (account: AdminUser, role: "user" | "admin") => void;
  onDelete: (account: AdminUser) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (isSelf) {
    return null;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button
        variant="secondary"
        disabled={isPending}
        onClick={() => onChangeRole(account, account.role === "admin" ? "user" : "admin")}
      >
        {account.role === "admin" ? t.demote : t.promote}
      </Button>
      <Button variant="danger" disabled={isPending} onClick={() => onDelete(account)}>
        {t.deleteAccount}
      </Button>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <AdminContent />
    </RequireAuth>
  );
}
