declare module "qrcode" {
  interface QRCodeToStringOptions {
    type?: "terminal" | "utf8" | "svg" | "png"
    small?: boolean
  }

  function toString(
    text: string,
    options?: QRCodeToStringOptions,
  ): Promise<string>
}
