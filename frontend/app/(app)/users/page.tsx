"use client";

import { useState } from "react";
import useSWR from "swr";
import { KeyRound, MoreHorizontal, Plus, ShieldAlert, ShieldOff, UserCheck, UserX } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/format";
import { useIsAdmin } from "@/lib/hooks";
import type { AdminUser } from "@/lib/types";
import { Avatar, Button, Card, ConfirmModal, EmptyState, Field, IconButton, Input, Menu, Modal, PageHeader, Pill, Skeleton, cn } from "@/components/ui";
import { useToast } from "@/components/toast";

const PASSWORD_HELP = "At least 10 characters with a letter and a number. Share it privately; they'll choose their own at first sign-in.";
const passwordError = (p: string) => (p.length < 10 || !/[A-Za-z]/.test(p) || !/[0-9]/.test(p) ? "At least 10 characters, with a letter and a number" : undefined);

/** Readable random temporary password, e.g. "Kite-Mango-4821". */
function generateTempPassword() {
  const words = ["Amber", "Cedar", "Comet", "Delta", "Ember", "Falcon", "Harbor", "Indigo", "Jasper", "Kite", "Lotus", "Mango", "Nova", "Orbit", "Pixel", "Quartz", "River", "Sierra", "Tiger", "Violet"];
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${words[r[0] % words.length]}-${words[r[1] % words.length]}-${1000 + (r[2] % 9000)}`;
}

function TempPasswordField({ value, onChange, error, id }: { value: string; onChange: (v: string) => void; error?: string; id: string }) {
  return (
    <Field label="Temporary password" htmlFor={id} error={error} helper={PASSWORD_HELP}>
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={Boolean(error)} className="font-mono" autoComplete="off" />
        <Button variant="secondary" onClick={() => onChange(generateTempPassword())}>
          Generate
        </Button>
      </div>
    </Field>
  );
}

function AddUser({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generateTempPassword);
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = "Full name is required";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Enter a valid email address";
    errs.password = passwordError(password);
    if (!errs.password) delete errs.password;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api("/api/users", { body: { name: name.trim(), email: email.trim(), tempPassword: password } });
      toast(`${name.trim()} added. Share the temporary password with them privately.`);
      onSaved();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't add user";
      setErrors(/email/i.test(msg) ? { email: msg } : /password/i.test(msg) ? { password: msg } : { form: msg });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Add user"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Add user
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Full name" htmlFor="u-name" error={errors.name}>
          <Input id="u-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} invalid={Boolean(errors.name)} />
        </Field>
        <Field label="Email" htmlFor="u-email" error={errors.email} helper="They sign in with this email.">
          <Input id="u-email" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} invalid={Boolean(errors.email)} />
        </Field>
        <TempPasswordField id="u-password" value={password} onChange={setPassword} error={errors.password} />
        <p className="rounded-md bg-accent-50 px-3 py-2 text-xs text-secondary">
          At first sign-in they&apos;ll scan a QR code with an authenticator app (two-factor), then choose their own password. New users are viewers.
        </p>
        {errors.form && <p role="alert" className="text-[13px] text-red-600">{errors.form}</p>}
      </div>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState(generateTempPassword);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function submit() {
    const err = passwordError(password);
    setError(err);
    if (err) return;
    setSaving(true);
    try {
      await api(`/api/users/${user.id}/reset-password`, { body: { tempPassword: password } });
      toast(`New temporary password set for ${user.name}. They've been signed out.`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reset password");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reset password for ${user.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            Set temporary password
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-secondary">They&apos;ll be signed out everywhere and asked to choose a new password after their next sign-in. Their two-factor app stays the same.</p>
        <TempPasswordField id="r-password" value={password} onChange={setPassword} error={error} />
      </div>
    </Modal>
  );
}

export default function UsersPage() {
  const isAdmin = useIsAdmin();
  const toast = useToast();
  const { data: users, mutate } = useSWR<AdminUser[]>(isAdmin ? "/api/users" : null, fetcher);
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null);
  const [resettingPw, setResettingPw] = useState<AdminUser | null>(null);
  const [resettingTotp, setResettingTotp] = useState<AdminUser | null>(null);

  if (!isAdmin) return <EmptyState icon={ShieldAlert} title="Admins only" text="This page is only available to the admin." />;

  async function setActive(u: AdminUser, active: boolean) {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: { active } });
      toast(active ? `${u.name} reactivated` : `${u.name} deactivated and signed out`);
      setDeactivating(null);
      mutate();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update user", "error");
    }
  }

  async function resetTotp(u: AdminUser) {
    try {
      await api(`/api/users/${u.id}/reset-totp`, { method: "POST" });
      toast(`Two-factor reset for ${u.name}. They'll scan a new QR code at next sign-in.`);
      setResettingTotp(null);
      mutate();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't reset two-factor", "error");
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Only people listed here can sign in (email + password + authenticator app)."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
            Add user
          </Button>
        }
      />
      <Card className="overflow-hidden p-0">
        {!users ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="h-10 pl-5 font-medium">Name</th>
                  <th className="font-medium">Email</th>
                  <th className="font-medium">Role</th>
                  <th className="font-medium">Two-factor</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium">Last sign-in</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={cn("h-12 border-b border-line/60 last:border-0", !u.active && "text-muted")}>
                    <td className="pl-5">
                      <span className="flex items-center gap-2.5">
                        <Avatar name={u.name} size={32} inactive={!u.active} />
                        <span className="font-medium">{u.name}</span>
                      </span>
                    </td>
                    <td className="text-[13px]">{u.email}</td>
                    <td>
                      {u.role === "admin" ? (
                        <span className="ai-border inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium">
                          <span className="text-ai">Admin</span>
                        </span>
                      ) : (
                        <Pill bg="#F4F4F5" text="#52525B">Viewer</Pill>
                      )}
                    </td>
                    <td>
                      {u.totpEnabled ? <Pill bg="#DCFCE7" text="#166534" dot="#22C55E">On</Pill> : <Pill bg="#FEF3C7" text="#92400E" dot="#F59E0B">Set up at next sign-in</Pill>}
                      {u.mustChangePassword && <span className="ml-1.5 text-xs text-muted">· temp password</span>}
                    </td>
                    <td>{u.active ? <Pill bg="#DCFCE7" text="#166534" dot="#22C55E">Active</Pill> : <Pill bg="#F4F4F5" text="#71717A" dot="#A1A1AA">Inactive</Pill>}</td>
                    <td className="text-[13px] text-muted" title={`Added ${formatDate(u.createdAt.slice(0, 10), true)}`}>
                      {u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}
                    </td>
                    <td className="pr-3">
                      {u.role !== "admin" && (
                        <Menu
                          trigger={(t) => <IconButton icon={MoreHorizontal} label={`Actions for ${u.name}`} {...t} />}
                          items={[
                            { label: "Reset password", icon: KeyRound, onClick: () => setResettingPw(u) },
                            ...(u.totpEnabled ? [{ label: "Reset two-factor", icon: ShieldOff, onClick: () => setResettingTotp(u) }] : []),
                            u.active ? { label: "Deactivate", icon: UserX, danger: true, onClick: () => setDeactivating(u) } : { label: "Reactivate", icon: UserCheck, onClick: () => setActive(u, true) },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {adding && <AddUser onClose={() => setAdding(false)} onSaved={() => mutate()} />}
      {resettingPw && <ResetPassword user={resettingPw} onClose={() => setResettingPw(null)} onSaved={() => mutate()} />}
      <ConfirmModal
        open={Boolean(resettingTotp)}
        title={`Reset two-factor for ${resettingTotp?.name}?`}
        text="Their authenticator app entry stops working and they're signed out everywhere. At next sign-in they'll scan a new QR code. Use this if they lost or changed their phone."
        confirmLabel="Reset two-factor"
        onClose={() => setResettingTotp(null)}
        onConfirm={() => resettingTotp && resetTotp(resettingTotp)}
      />
      <ConfirmModal
        open={Boolean(deactivating)}
        title={`Deactivate ${deactivating?.name}?`}
        text={`${deactivating?.name.split(" ")[0]} won't be able to sign in and will be signed out everywhere.`}
        confirmLabel="Deactivate"
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && setActive(deactivating, false)}
      />
    </>
  );
}
