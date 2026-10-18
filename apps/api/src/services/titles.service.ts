import { titlesRepository, type TitleListFilters, type TitleHydrated } from '../repositories/titles.repository.js';
import type { TitleCreateInput, TitleUpdateInput } from '@animemanager/shared';
import { NotFoundError, BadRequestError } from '../errors/index.js';

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
    return titlesRepository.create(ownerId, data);
  },

  async updateTitle(ownerId: string, id: string, data: TitleUpdateInput): Promise<TitleHydrated> {
    const updated = await titlesRepository.update(ownerId, id, data);
    if (!updated) {
      throw new NotFoundError('Title not found');
    }
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
  },
};
