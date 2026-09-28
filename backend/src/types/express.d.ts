declare global {
  namespace Express {
    interface Request {
      deviceFingerprint?: string;
      user?: {
        id: string;
        email: string;
        role: string;
        sessionId?: string;
        tailscaleIP?: string;   // stored IP in the session
        csrfToken?: string;
      };
      tailscaleClientIP?: string; // extracted from Tailscale on each request
      signatureValidated?: boolean;
      geoLocation?: any;          // if used elsewhere
    }
  }
}
export {};