export class IdentityVerificationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IdentityVerificationError";
  }
}
