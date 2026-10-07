import { RACES_BY_ID, type OfficerId } from '../content/crew';
import type { CrewMember } from './types';

export const SUPPLY_PER_CREW_DAY = 0.35;

export function crewSupplyPerDay(state: { crew: CrewMember[] }): number {
  return state.crew.reduce((s, c) => s + SUPPLY_PER_CREW_DAY * RACES_BY_ID[c.race].supply, 0);
}

export function crewHasOfficer(state: { crew: CrewMember[] }, id: OfficerId): boolean {
  return state.crew.some((c) => c.officer === id);
}
