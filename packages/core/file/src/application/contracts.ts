import type { AttachmentSnapshot, TrustedDeliveryAuthorization } from "../domain/file.js";
import type { Sha256, UtcInstant, Uuid } from "@youone/shared-kernel/public";
export interface ServerIssuedUploadIntent { readonly intentId:Uuid; readonly attachmentId:Uuid; readonly documentVersionId:Uuid; readonly ownerUserId:Uuid; readonly bucket:string; readonly storageKey:string; readonly mimeType:string; readonly sizeBytes:number; readonly sha256:Sha256; readonly expiresAt:UtcInstant }
export interface PrivateUploadGrant { readonly attachmentId:Uuid; readonly provider:"SUPABASE_STORAGE"; readonly expiresAt:UtcInstant; readonly opaqueUploadToken:string }
export interface AuthorizedDeliveryRequest { readonly attachment:AttachmentSnapshot; readonly authorization:TrustedDeliveryAuthorization; readonly requestedTtlSeconds:number }
export interface ShortLivedDelivery { readonly attachmentId:Uuid; readonly expiresAt:UtcInstant; readonly redemptionEndpoint:string; readonly oneTimeBrokerToken:string }
export interface UploadIntentIssuer { issue(input:{attachmentId:Uuid;documentVersionId:Uuid;ownerUserId:Uuid;mimeType:string;sizeBytes:number;sha256:Sha256;expiresAt:UtcInstant}):Promise<ServerIssuedUploadIntent> }
export interface PrivateStoragePort { createUploadGrant(request:ServerIssuedUploadIntent):Promise<PrivateUploadGrant>; createAuthorizedDelivery(request:AuthorizedDeliveryRequest):Promise<ShortLivedDelivery>; headObject(bucket:string,storageKey:string):Promise<{mimeType:string;sizeBytes:number;sha256:Sha256}> }
