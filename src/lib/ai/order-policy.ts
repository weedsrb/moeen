const NAME_FIELDS = new Set(["name", "customer_name"]);
const PHONE_FIELDS = new Set(["phone", "phone_number"]);
const ADDRESS_FIELDS = new Set(["address", "delivery_address"]);

export function resolveRequiredMissingFields(params: {
  modelMissingFields: string[];
  requireCustomerName: boolean;
  requireCustomerPhone: boolean;
  customer: {
    name: string | null;
    phone: string | null;
    deliveryAddress: string | null;
  };
}): string[] {
  const missing = new Set(
    params.modelMissingFields.filter((field) => {
      const normalized = field.trim().toLowerCase();
      if (NAME_FIELDS.has(normalized)) return params.requireCustomerName;
      if (PHONE_FIELDS.has(normalized)) return params.requireCustomerPhone;
      if (ADDRESS_FIELDS.has(normalized)) return true;
      return true;
    })
  );

  if (params.customer.deliveryAddress) {
    for (const field of [...missing]) {
      if (ADDRESS_FIELDS.has(field.trim().toLowerCase())) missing.delete(field);
    }
  } else {
    missing.add("delivery_address");
  }

  if (params.requireCustomerName && !params.customer.name) {
    missing.add("name");
  } else if (!params.requireCustomerName || params.customer.name) {
    for (const field of [...missing]) {
      if (NAME_FIELDS.has(field.trim().toLowerCase())) missing.delete(field);
    }
  }

  if (params.requireCustomerPhone && !params.customer.phone) {
    missing.add("phone");
  } else if (!params.requireCustomerPhone || params.customer.phone) {
    for (const field of [...missing]) {
      if (PHONE_FIELDS.has(field.trim().toLowerCase())) missing.delete(field);
    }
  }

  return [...missing];
}
