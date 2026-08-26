-- Allow multiple line items per PO number by removing unique constraint on po_number
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON public.purchase_orders (po_number);
