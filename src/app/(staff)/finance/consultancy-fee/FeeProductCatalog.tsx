"use client";

import { useActionState, useState } from "react";
import { createFeeProduct, updateFeeProduct, deleteFeeProduct } from "@/lib/actions/consultancyFee";

type Product = { id: string; name: string; default_amount: number | null; default_currency: string };

function NewProductForm() {
  const [state, formAction, pending] = useActionState(createFeeProduct, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input name="name" placeholder="Product / fee name" required className="w-48 rounded-md border border-border px-2 py-1.5 text-sm" />
      <input name="default_amount" type="number" step="0.01" placeholder="Default amount" className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
      <select name="default_currency" defaultValue="EUR" className="rounded-md border border-border px-2 py-1.5 text-sm">
        <option value="EUR">EUR</option>
        <option value="PKR">PKR</option>
        <option value="USD">USD</option>
      </select>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink disabled:opacity-50">
        {pending ? "Adding…" : "+ Add product"}
      </button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function ProductRow({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const action = updateFeeProduct.bind(null, product.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 border-b border-border py-2">
        <input name="name" defaultValue={product.name} required className="w-48 rounded-md border border-border px-2 py-1.5 text-sm" />
        <input name="default_amount" type="number" step="0.01" defaultValue={product.default_amount ?? ""} className="w-32 rounded-md border border-border px-2 py-1.5 text-sm" />
        <select name="default_currency" defaultValue={product.default_currency} className="rounded-md border border-border px-2 py-1.5 text-sm">
          <option value="EUR">EUR</option>
          <option value="PKR">PKR</option>
          <option value="USD">USD</option>
        </select>
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink disabled:opacity-50">
          {pending ? "…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
      <span className="text-ink">
        {product.name}
        {product.default_amount != null && <span className="text-muted"> · {product.default_currency} {product.default_amount}</span>}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete "${product.name}" from the fee catalog?`)) deleteFeeProduct(product.id);
          }}
          className="text-xs text-danger hover:underline"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function FeeProductCatalog({ products }: { products: Product[] }) {
  const [open, setOpen] = useState(false);

  return (
    <details className="mb-6 rounded-lg border border-border bg-card p-4" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-medium text-ink">Fee / product catalog ({products.length})</summary>
      <div className="mt-3">
        <NewProductForm />
        <div className="mt-3 flex flex-col">
          {products.map((p) => (
            <ProductRow key={p.id} product={p} />
          ))}
          {products.length === 0 && <p className="py-2 text-sm text-muted">No products yet — add one above to offer it as a line item on invoices.</p>}
        </div>
      </div>
    </details>
  );
}
