import { z } from 'zod';
import {
  titleCreateSchema,
  titleUpdateSchema,
  titleAliasSchema,
  collectionCreateSchema,
  collectionUpdateSchema,
  bookmarkCreateSchema,
  bookmarkUpdateSchema,
  importSearchQuerySchema,
  importPreviewQuerySchema,
  importDraftSchema,
  importFieldSelectionSchema,
  importCommitSchema,
  loginInputSchema,
  createSuperAdminSchema,
  updateSuperAdminStatusSchema,
} from '../schemas/index.js';
import {
  MediaType,
  BookmarkStatus,
  ProgressUnit,
  CoverSourceType,
  CollectionSortMode,
} from '../constants/index.js';

export * from '../constants/index.js';

export type TitleCreateInput = z.infer<typeof titleCreateSchema>;
export type TitleUpdateInput = z.infer<typeof titleUpdateSchema>;
export type TitleAliasInput = z.infer<typeof titleAliasSchema>;

export type CollectionCreateInput = z.infer<typeof collectionCreateSchema>;
export type CollectionUpdateInput = z.infer<typeof collectionUpdateSchema>;

export type BookmarkCreateInput = z.infer<typeof bookmarkCreateSchema>;
export type BookmarkUpdateInput = z.infer<typeof bookmarkUpdateSchema>;

export type ImportSearchQuery = z.infer<typeof importSearchQuerySchema>;
export type ImportPreviewQuery = z.infer<typeof importPreviewQuerySchema>;
export type ImportDraft = z.infer<typeof importDraftSchema>;
export type ImportFieldSelection = z.infer<typeof importFieldSelectionSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;




export interface ImportSearchResultItem {
  malId: number;
  mediaType: MediaType;
  sourceType: string | null;
  englishTitle: string;
  originalTitle: string | null;
  romanizedTitle: string | null;
  coverUrl: string | null;
  synopsisSnippet: string | null;
  sourceScore: number | null;
  sourceRank: number | null;
  publicationStatus: string | null;
  releaseYear: number | null;
}

export interface ImportSearchResponse {
  items: ImportSearchResultItem[];
  page: number;
  hasNextPage: boolean;
}


export interface TitleEntity {
  id: string;
  ownerId: string;
  mediaType: MediaType;
  englishTitle: string;
  originalTitle: string | null;
  synopsis: string | null;
  background: string | null;
  coverUrl: string | null;
  coverStoragePath: string | null;
  coverSourceType: CoverSourceType;
  releaseYear: number | null;
  publicationStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  episodeCount: number | null;
  chapterCount: number | null;
  sourceScore: number | null;
  sourceRank: number | null;
  sourcePopularity: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionEntity {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  icon: string | null;
  color: string | null;
  sortMode: CollectionSortMode;
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkEntity {
  id: string;
  ownerId: string;
  titleId: string;
  status: BookmarkStatus;
  progress: number;
  progressUnit: ProgressUnit;
  progressTotal: number | null;
  priority: number | null;
  personalRating: number | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalSourceEntity {
  id: string;
  titleId: string;
  provider: string;
  externalId: string;
  sourceUrl: string | null;
  lastFetchedAt: string | null;
  createdAt: string;
}

// ── Auth & Account Roles ──────────────────────────────────────────────
export type AuthRole = 'root_admin' | 'superadmin' | 'user' | 'authenticated';
export type UserStatus = 'active' | 'restricted' | 'disabled' | 'deleted';
export type SuperAdminStatus = 'active' | 'disabled';
export type RootAdminStatus = 'active' | 'disabled';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterUserInput {
  username: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface CreateSuperAdminInput {
  username?: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface UpdateSuperAdminStatusInput {
  status: SuperAdminStatus;
  reason?: string;
}

export interface UpdateUserStatusInput {
  status: UserStatus;
  reason?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username?: string;
  displayName: string;
  role: AuthRole;
  status?: UserStatus | SuperAdminStatus | RootAdminStatus;
  adminId?: string;
}

export interface ManagedUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: 'user' | 'owner';
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  titlesCount: number;
  bookmarksCount: number;
  collectionsCount: number;
}

export interface SuperAdminProfile {
  id: string;
  username?: string;
  email: string;
  displayName: string;
  role: 'superadmin';
  status: SuperAdminStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

export interface RootAdminProfile {
  id: string;
  username?: string;
  email: string;
  displayName: string;
  role: 'root_admin';
  status: RootAdminStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  actorId: string;
  actorRole: string;
  targetId?: string | null;
  targetType?: string | null;
  action: string;
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
  timestamp: string;
}

