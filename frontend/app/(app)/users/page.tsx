"use client";

import { useState } from "react";
import useSWR from "swr";
import { MoreHorizontal, Plus, ShieldAlert, UserCheck, UserX } from "lucide-react";
import { api, fetcher } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useIsAdmin } from "@/lib/hooks";
import type { AdminUser } from "@/lib/types";
import { Avatar, Button, Card, ConfirmModal, EmptyState, Field, IconButton, Input, Menu, Modal, PageHeader, Pill, Select, Skeleton, cn } from "@/components/ui";
import { useToast } from "@/components/toast";

function AddUser({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [cc, setCc] = useState("+91");
  const [num, setNum] = useState("");
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);
  async function submit() {
    const digits = num.replace(/\D/g, "");
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = "Full name is required";
    if (cc === "+91" ? digits.length !== 10 : digits.length < 6) errs.phone = "Enter a valid mobile number";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api("/api/users", { body: { name: name.trim(), phoneNumber: `${cc}${digits}` } });
      toast(`${name.trim()} added`);
      onSaved();
      onClose();
    } catch (e) {
      setErrors({ phone: e instanceof Error ? e.message : "Couldn't add user" });
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
        <Field label="Mobile number" htmlFor="u-phone" error={errors.phone} helper="They'll sign in with a code sent to this number.">
          <div className="flex gap-2">
            <Select aria-label="Country code" value={cc} onChange={(e) => setCc(e.target.value)} className="w-24">
              {["+91", "+1", "+44", "+971", "+65"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Input id="u-phone" inputMode="tel" placeholder="98765 43210" value={num} onChange={(e) => setNum(e.target.value)} invalid={Boolean(errors.phone)} />
          </div>
        </Field>
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

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Only numbers listed here can sign in."
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
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th className="h-10 pl-5 font-medium">Name</th>
                  <th className="font-medium">Mobile</th>
                  <th className="font-medium">Role</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium">Added</th>
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
                    <td className="tabular font-mono text-[13px]">{u.phoneMasked}</td>
                    <td>
                      {u.role === "admin" ? (
                        <span className="ai-border inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium">
                          <span className="text-ai">Admin</span>
                        </span>
                      ) : (
                        <Pill bg="#F4F4F5" text="#52525B">Viewer</Pill>
                      )}
                    </td>
                    <td>{u.active ? <Pill bg="#DCFCE7" text="#166534" dot="#22C55E">Active</Pill> : <Pill bg="#F4F4F5" text="#71717A" dot="#A1A1AA">Inactive</Pill>}</td>
                    <td className="text-[13px] text-muted">{formatDate(u.createdAt.slice(0, 10), true)}</td>
                    <td className="pr-3">
                      {u.role !== "admin" && (
                        <Menu
                          trigger={(t) => <IconButton icon={MoreHorizontal} label={`Actions for ${u.name}`} {...t} />}
                          items={u.active ? [{ label: "Deactivate", icon: UserX, danger: true, onClick: () => setDeactivating(u) }] : [{ label: "Reactivate", icon: UserCheck, onClick: () => setActive(u, true) }]}
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
      <ConfirmModal
        open={Boolean(deactivating)}
        title={`Deactivate ${deactivating?.name}?`}
        text={`${deactivating?.name.split(" ")[0]} won't be able to sign in and will be signed out everywhere. Their tasks stay assigned.`}
        confirmLabel="Deactivate"
        onClose={() => setDeactivating(null)}
        onConfirm={() => deactivating && setActive(deactivating, false)}
      />
    </>
  );
}
