import { titlesRepository, type TitleListFilters, type TitleHydrated } from '../repositories/titles.repository.js';
import type { TitleCreateInput, TitleUpdateInput } from '@animemanager/shared';
import { NotFoundError, BadRequestError } from '../errors/index.js';
import { auditLogsRepository } from '../repositories/audit-logs.repository.js';

export const titlesService = {
  async listTitles(ownerId: string, filters: TitleListFilters) {
    return titlesRepository.list(ownerId, filters);
  },

  async getTitleById(ownerId: string, id: string): Promise<TitleHydrated> {
    const title = await titlesRepository.findById(ownerId, id);
    if (!title) {
      throw new NotFoundError('Title not found');
    }
    return title;
  },

  async createTitle(ownerId: string, data: TitleCreateInput): Promise<TitleHydrated> {
    const created = await titlesRepository.create(ownerId, data);

    // Privacy-preserving audit event: records event type and category only (NEVER private title text or synopsis)
    await auditLogsRepository.recordEvent({
      eventType: 'user.library_item_added',
      actorId: ownerId,
      actorRole: 'user',
      targetType: 'library',
      action: 'User added a library item',
      outcome: 'success',
      metadata: { category: 'library', mediaType: data.mediaType },
    });

    return created;
  },

  async updateTitle(ownerId: string, id: string, data: TitleUpdateInput): Promise<TitleHydrated> {
    const updated = await titlesRepository.update(ownerId, id, data);
    if (!updated) {
      throw new NotFoundError('Title not found');
    }

    await auditLogsRepository.recordEvent({
      eventType: 'user.library_item_updated',
      actorId: ownerId,
      actorRole: 'user',
      targetType: 'library',
      action: 'User updated a library item',
      outcome: 'success',
      metadata: { mediaType: updated.mediaType },
    });

    return updated;
  },

  async deleteTitle(ownerId: string, id: string, confirm?: string): Promise<void> {
    if (confirm !== 'true' && confirm !== '1') {
      throw new BadRequestError('Title deletion requires explicit confirmation parameter (?confirm=true)');
    }
    const deleted = await titlesRepository.delete(ownerId, id);
    if (!deleted) {
      throw new NotFoundError('Title not found');
    }

    await auditLogsRepository.recordEvent({
      eventType: 'user.library_item_deleted',
      actorId: ownerId,
      actorRole: 'user',
      targetType: 'library',
      action: 'User removed a library item',
      outcome: 'success',
    });
  },
};
