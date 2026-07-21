const VIETNAM_PHONE_PATTERN =
  /(^|[^\doO])((?:(?:\+?84|[0oO])(?:[\s.-]*[\doO]){9}|[35789](?:[\s.-]*[\doO]){8}))(?=$|[^\doO])/g;

export function redactPhoneNumbers(value: string) {
  return value.replace(VIETNAM_PHONE_PATTERN, (match, prefix: string, phone: string) => {
    const digits = phone.replace(/[oO]/g, "0").replace(/\D/g, "");
    const isVietnamPhone =
      (digits.startsWith("0") && digits.length === 10) ||
      (digits.startsWith("84") && digits.length === 11) ||
      (/^[35789]/.test(digits) && digits.length === 9);

    return isVietnamPhone ? `${prefix}***${digits.slice(-3)}` : match;
  });
}
