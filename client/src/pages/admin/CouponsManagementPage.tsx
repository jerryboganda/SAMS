import React, { useEffect, useState } from "react";
import { Plus, Ticket, Trash2, Edit2, CheckCircle2, AlertCircle, Calendar } from "lucide-react";
import {
  Card,
  Button,
  Input,
  Select,
  Table,
  Badge,
  Modal,
  ToastSystem,
  ConfirmDialog,
  ProgressBar,
} from "../../components/ui";
import { adminApi } from "../../api/endpoints/admin";
import { Coupon } from "../../types";
import { formatPKR } from "../../utils/formatters";
import { useAdminSearch } from "../../context/AdminSearchContext";

export const CouponsManagementPage: React.FC = () => {
  const { globalSearch } = useAdminSearch();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  // Form Fields
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("15");
  const [maxUses, setMaxUses] = useState("100");
  const [isActive, setIsActive] = useState(true);

  // Delete Confirm State
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getCoupons();
      setCoupons(data);
    } catch (err) {
      console.error("Failed to load coupons", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const handleOpenCreateModal = () => {
    setEditingCoupon(null);
    setCode("");
    setType("percent");
    setValue("15");
    setMaxUses("100");
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (c: Coupon) => {
    setEditingCoupon(c);
    setCode(c.code);
    setType(c.type);
    setValue(c.value.toString());
    setMaxUses(c.maxUses ? c.maxUses.toString() : "100");
    setIsActive(c.isActive);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCoupon) {
        const updated = await adminApi.updateCoupon(editingCoupon.id, {
          code: code.toUpperCase().trim(),
          type,
          value: Number(value),
          maxUses: Number(maxUses),
          isActive,
        });
        setCoupons(coupons.map((c) => (c.id === updated.id ? updated : c)));
        setToast(`Promo coupon "${updated.code}" updated successfully.`);
      } else {
        const created = await adminApi.createCoupon({
          code: code.toUpperCase().trim(),
          type,
          value: Number(value),
          maxUses: Number(maxUses),
          isActive,
        });
        setCoupons([created, ...coupons]);
        setToast(`New promo coupon "${created.code}" created!`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Operation failed.");
    }
  };

  const handleToggleActive = async (c: Coupon) => {
    try {
      const updated = await adminApi.toggleCouponActive(c.id);
      setCoupons(coupons.map((item) => (item.id === updated.id ? updated : item)));
      setToast(`Coupon "${c.code}" is now ${updated.isActive ? "ACTIVE" : "INACTIVE"}`);
    } catch (err: any) {
      alert(err.message || "Toggle failed.");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteCoupon(deleteTarget.id);
      setCoupons(coupons.filter((c) => c.id !== deleteTarget.id));
      setToast(`Coupon "${deleteTarget.code}" deleted.`);
      setDeleteTarget(null);
    } catch (err: any) {
      alert(err.message || "Delete failed.");
    }
  };

  const filteredCoupons = coupons.filter((c) => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.code.toLowerCase().includes(q) ||
      c.type.toLowerCase().includes(q) ||
      String(c.id).includes(q)
    );
  });

  return (
    <div className="space-y-8 pb-12">
      {toast && (
        <ToastSystem
          toasts={[{ id: "1", type: "success", title: toast }]}
          onClose={() => setToast("")}
        />
      )}

      {/* Header */}
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0E2A47]">Coupons & Promotional Discounts</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create discount codes, set percentage or flat PKR price deductions, and cap max usages.
          </p>
        </div>
        <Button variant="teal" icon={<Plus className="w-4 h-4" />} onClick={handleOpenCreateModal}>
          Create Promo Coupon
        </Button>
      </div>

      <Card className="p-6 border-slate-200">
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Loading promo coupons...</div>
        ) : (
          <Table
            columns={[
              {
                header: "Coupon Code",
                accessor: (c: Coupon) => (
                  <div className="flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-[#0FA3A3]" />
                    <span className="font-mono font-extrabold text-[#0E2A47] text-sm">{c.code}</span>
                  </div>
                ),
              },
              {
                header: "Discount Value",
                accessor: (c: Coupon) => (
                  <span className="font-bold text-slate-800">
                    {c.type === "percent" ? `${c.value}% OFF` : `${formatPKR(c.value)} OFF`}
                  </span>
                ),
              },
              {
                header: "Usage & Redemptions",
                accessor: (c: Coupon) => {
                  const max = c.maxUses || 100;
                  const pct = Math.min(100, Math.round((c.usedCount / max) * 100));
                  return (
                    <div className="w-36 space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-slate-600">
                        <span>{c.usedCount} Used</span>
                        <span>{max} Max</span>
                      </div>
                      <ProgressBar value={pct} max={100} size="sm" variant={pct >= 100 ? "danger" : "teal"} />
                    </div>
                  );
                },
              },
              {
                header: "Status Toggle",
                accessor: (c: Coupon) => (
                  <button
                    onClick={() => handleToggleActive(c)}
                    className="flex items-center gap-1.5 focus:outline-hidden"
                  >
                    <Badge variant={c.isActive ? "teal" : "gray"} size="sm">
                      {c.isActive ? "ACTIVE ✓" : "INACTIVE"}
                    </Badge>
                  </button>
                ),
              },
              {
                header: "Actions",
                accessor: (c: Coupon) => (
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      icon={<Edit2 className="w-3.5 h-3.5" />}
                      onClick={() => handleOpenEditModal(c)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="danger"
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => setDeleteTarget(c)}
                    >
                      Delete
                    </Button>
                  </div>
                ),
              },
            ]}
            data={filteredCoupons}
            keyExtractor={(c) => c.id}
          />
        )}
      </Card>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingCoupon ? `Edit Coupon "${editingCoupon.code}"` : "Create New Promo Coupon"}
        >
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <Input
              label="Coupon Code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. SAMS2026 or WELCOME10"
              className="font-mono font-bold uppercase"
            />

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Discount Type"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                options={[
                  { value: "percent", label: "Percentage (% OFF)" },
                  { value: "fixed", label: "Flat Amount (PKR OFF)" },
                ]}
              />

              <Input
                label={type === "percent" ? "Percentage Value (%)" : "Flat PKR Amount"}
                type="number"
                required
                min="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>

            <Input
              label="Maximum Usage Limit"
              type="number"
              required
              min="1"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="isActiveSwitch"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 text-[#0FA3A3] rounded focus:ring-teal-500"
              />
              <label htmlFor="isActiveSwitch" className="text-xs font-bold text-slate-800">
                Activate coupon immediately upon saving
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="teal" type="submit">
                {editingCoupon ? "Save Changes" : "Create Coupon"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Promo Coupon"
        message={`Are you sure you want to delete coupon code "${deleteTarget?.code}"? Students will no longer be able to apply this promo code during checkout.`}
        confirmLabel="Delete Coupon"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
