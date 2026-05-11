"use client";

import { ReactNode, useState } from "react";
import { Status } from "@/lib/types";

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
};

export function Button({
  children,
  variant = "primary",
  className = "",
  onClick,
  type = "button",
  disabled
}: ButtonProps) {
  const variants = {
    primary: "bg-black text-white border-black hover:bg-neutral-800",
    secondary: "bg-white text-black border-neutral-300 hover:bg-neutral-100",
    danger: "bg-white text-black border-black hover:bg-neutral-100",
    ghost: "bg-transparent text-black border-transparent hover:bg-neutral-100"
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({
  label,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block text-sm font-medium text-black">
      {label && <span className="mb-2 block">{label}</span>}
      <input
        {...props}
        className={`w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-black placeholder:text-neutral-500 focus:border-black ${className}`}
      />
    </label>
  );
}

export function PasswordInput({
  label,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block text-sm font-medium text-black">
      {label && <span className="mb-2 block">{label}</span>}
      <span className="flex rounded-md border border-neutral-300 bg-white focus-within:border-black">
        <input
          {...props}
          type={visible ? "text" : "password"}
          className={`min-w-0 flex-1 rounded-l-md border-0 bg-white px-3 py-2 text-sm text-black placeholder:text-neutral-500 focus:outline-none ${className}`}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="shrink-0 border-l border-neutral-300 px-3 text-sm text-black hover:bg-neutral-100"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}

export function Textarea({
  label,
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block text-sm font-medium text-black">
      {label && <span className="mb-2 block">{label}</span>}
      <textarea
        {...props}
        className={`min-h-24 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-black placeholder:text-neutral-500 focus:border-black ${className}`}
      />
    </label>
  );
}

export function Select({
  label,
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block text-sm font-medium text-black">
      {label && <span className="mb-2 block">{label}</span>}
      <select
        {...props}
        className={`w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-black focus:border-black ${className}`}
      >
        {children}
      </select>
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-md border border-neutral-200 bg-white p-4 ${className}`}>{children}</section>;
}

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    Pending: "border-black bg-black text-white",
    "In Progress": "border-orange-600 bg-orange-600 text-white",
    Failed: "border-red-600 bg-red-600 text-white",
    "Waiting for Approval": "border-orange-600 bg-white text-orange-700",
    Complete: "border-green-600 bg-green-600 text-white"
  };

  return <Badge className={styles[status]}>{status}</Badge>;
}

export function Modal({
  title,
  children,
  onClose,
  showCloseButton = true
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  showCloseButton?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-neutral-300 bg-white p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-black">{title}</h2>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100"
              aria-label="Close modal"
            >
              Close
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  onCancel,
  onConfirm,
  confirmLabel = "Delete",
  cancelLabel = "Cancel"
}: {
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  return (
    <Modal title={title} onClose={onCancel} showCloseButton={false}>
      <p className="mb-6 text-sm text-neutral-700">{message}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function Table({
  headers,
  children
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200 bg-white">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-neutral-100 text-black">
          <tr>
            {headers.map((header) => (
              <th key={header} className="border-b border-neutral-200 px-4 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">{children}</tbody>
      </table>
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <div className="text-2xl font-semibold text-black">{value}</div>
      <div className="mt-1 text-sm text-neutral-600">{label}</div>
    </Card>
  );
}

export function EmptyState({ title }: { title: string }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-600">
      {title}
    </div>
  );
}

export function StatusTimeline({ current }: { current: Status }) {
  const steps: { status: Status; note: string }[] = [
    { status: "Pending", note: "Admin assigned the task" },
    { status: "In Progress", note: "Developer started the task" },
    { status: "Failed", note: "Issue reported" },
    { status: "Waiting for Approval", note: "Sent to admin" },
    { status: "Complete", note: "Admin approved" }
  ];
  const styles: Record<Status, string> = {
    Pending: "border-black bg-black text-white",
    "In Progress": "border-orange-600 bg-orange-600 text-white",
    Failed: "border-red-600 bg-red-600 text-white",
    "Waiting for Approval": "border-orange-600 bg-white text-orange-700",
    Complete: "border-green-600 bg-green-600 text-white"
  };

  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {steps.map((step) => {
        const active = step.status === current;
        const outlinedActive = active && step.status === "Waiting for Approval";
        return (
          <div
            key={step.status}
            className={`rounded-md border p-3 ${styles[step.status]} ${active ? "ring-2 ring-black ring-offset-2" : ""}`}
          >
            <div className="text-sm font-semibold">{step.status}</div>
            <div className={`mt-1 text-xs ${active && !outlinedActive ? "text-white/80" : "text-current opacity-70"}`}>{step.note}</div>
          </div>
        );
      })}
    </div>
  );
}
