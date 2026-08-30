"use client";

import { useActionState, useState } from "react";
import { createFeeProduct, updateFeeProduct, deleteFeeProduct } from "@/lib/actions/consultancyFee";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type Product = { id: string; name: string; default_amount: number | null; default_currency: string };

function NewProductForm() {
  const [state, formAction, pending] = useActionState(createFeeProduct, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <Input name="name" placeholder="Product / fee name" required className="w-48" />
      <Input name="default_amount" type="number" step="0.01" placeholder="Default amount" className="w-32" />
      <Select name="default_currency" defaultValue="EUR">
        <option value="EUR">EUR</option>
        <option value="PKR">PKR</option>
        <option value="USD">USD</option>
      </Select>
      <Button type="submit" variant="primary" pending={pending}>
        + Add product
      </Button>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}

function ProductRow({ product, canManage }: { product: Product; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const action = updateFeeProduct.bind(null, product.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  async function handleDelete() {
    if (!confirm(`Delete "${product.name}" from the fee catalog?`)) return;
    setDeleteError(null);
    const result = await deleteFeeProduct(product.id);
    if (result?.error) setDeleteError(result.error);
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-end gap-2 border-b border-border py-2">
        <Input name="name" defaultValue={product.name} required className="w-48" />
        <Input name="default_amount" type="number" step="0.01" defaultValue={product.default_amount ?? ""} className="w-32" />
        <Select name="default_currency" defaultValue={product.default_currency}>
          <option value="EUR">EUR</option>
          <option value="PKR">PKR</option>
          <option value="USD">USD</option>
        </Select>
        <Button type="submit" variant="primary" size="sm" pending={pending}>
          Save
        </Button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
          Cancel
        </button>
        {state?.error && <p className="w-full text-xs text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="border-b border-border py-2 text-sm last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-ink">
          {product.name}
          {product.default_amount != null && <span className="text-muted"> · {product.default_currency} {product.default_amount}</span>}
        </span>
        {canManage && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary hover:underline">
              Edit
            </button>
            <button type="button" onClick={handleDelete} className="text-xs text-danger hover:underline">
              Delete
            </button>
          </div>
        )}
      </div>
      {deleteError && <p className="mt-1 text-xs text-danger">{deleteError}</p>}
    </div>
  );
}

export function FeeProductCatalog({ products, canManage }: { products: Product[]; canManage: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <details className="mb-6 rounded-lg border border-border bg-card p-4" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-medium text-ink">Fee / product catalog ({products.length})</summary>
      <div className="mt-3">
        {canManage && <NewProductForm />}
        <div className="mt-3 flex flex-col">
          {products.map((p) => (
            <ProductRow key={p.id} product={p} canManage={canManage} />
          ))}
          {products.length === 0 && (
            <div className="py-2">
              <EmptyState>No products yet — add one above to offer it as a line item on invoices.</EmptyState>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
