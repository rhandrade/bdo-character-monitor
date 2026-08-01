import axios from 'axios';
import * as cheerio from 'cheerio';
import 'dotenv/config';
import { dirname } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const IDS_JSON: string = process.env.ADVENTURER_PROFILE_IDS_JSON || '';
const DISCORD_WEBHOOK: string = process.env.DISCORD_WEBHOOK_URL || '';
const STATE_FILE: string = './data/state.json';

type FamilyState = Record<string, string[]>;

type FamilyResult = {
  family: string;
  characters: string[];
};
const parseUrls = (value: string): string[] => {
  if (!value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error('ADVENTURER_PROFILE_IDS_JSON should be a JSON array of profile IDs.');
    }

    const urls = parsed.filter((item): item is string => typeof item === 'string');
    if (urls.length !== parsed.length) {
      throw new Error('ADVENTURER_PROFILE_IDS_JSON should contain only strings.');
    }

    return urls;
  } catch {
    throw new Error('ADVENTURER_PROFILE_IDS_JSON invalid. Use a JSON containing an array of profile IDs.');
  }
};

const sendDiscordMessage = async (message: string): Promise<any> => {
  try {
    console.log('Sending Discord message...');
    await axios.post(DISCORD_WEBHOOK, {
      content: message,
    });
    console.log('Discord message sent!');
  } catch (err) {
    console.error('Error when sending Discord message:', (err as Error).message);
  }
};

const getAdventurerInfo = async (profile: string): Promise<FamilyResult> => {
  const response = await axios.get(
    `https://www.sa.playblackdesert.com/pt-BR/Adventure/Profile?profileTarget=${profile}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    }
  );

  const $ = cheerio.load(response.data as string);
  const personagens: string[] = [];

  const family = $('.box_profile_area .profile_info .profile_detail .nick').text().trim() || profile;

  $('.character_name').each((i, el) => {
    const fullText = $(el).text().trim();
    const labelText = $(el).find('.selected_label').text().trim();
    const text = fullText.replace(labelText, '').trim();
    if (text) {
      personagens.push(text);
    }
  });

  return { family, characters: personagens };
};

const getAllAdventurers = async (profiles: string[]): Promise<FamilyState> => {
  const results = await Promise.all(profiles.map(async (profile) => await getAdventurerInfo(profile)));

  return results.reduce<FamilyState>((state, result) => {
    if (!state[result.family]) state[result.family] = [];
    state[result.family] = Array.from(new Set([...state[result.family], ...result.characters]));
    return state;
  }, {});
};

const loadCurrentState = (): FamilyState | null => {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8')) as FamilyState;
  }
  return null;
};

const saveState = (data: FamilyState): void => {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
};

const formatRemovedMessage = (family: string, removed: string[], beforeCount: number, afterCount: number): string => {
  return `Removed Character for family ${family}!\nRemoved: ${removed.join(', ')}\nBefore: ${beforeCount} | Now: ${afterCount}`;
};

const main = async () => {
  try {
    console.log('Starting adventurer info monitoring...');
   
    if (!IDS_JSON || !DISCORD_WEBHOOK) {
      throw new Error('Environment variables not set.');
    }

    const profiles = parseUrls(IDS_JSON);
    if (profiles.length === 0) {
      throw new Error('ADVENTURER_PROFILE_IDS_JSON must contain at least one profile ID.');
    }

    const currentState: FamilyState = await getAllAdventurers(profiles);
    const previousState: FamilyState | null = loadCurrentState();

    console.log('Current characters by family:', currentState);

    const removedMessages: string[] = [];

    if (previousState) {
      for (const family of Object.keys(currentState)) {
        const currentCharacters = currentState[family] || [];
        const previousCharacters = previousState[family] || [];

        const removed = previousCharacters.filter((character) => !currentCharacters.includes(character));
        if (removed.length > 0) {
          removedMessages.push(
            formatRemovedMessage(family, removed, previousCharacters.length, currentCharacters.length)
          );
        }
      }

      const removedFamilies = Object.keys(previousState).filter(
        (family) => !Object.prototype.hasOwnProperty.call(currentState, family)
      );
      if (removedFamilies.length > 0) {
        removedFamilies.forEach((family) => {
          const removed = previousState[family] || [];
          removedMessages.push(
            `Removed entire family ${family}!\nRemoved: ${removed.join(', ')}\nBefore: ${removed.length} | Now: 0`
          );
        });
      }

      if (removedMessages.length > 0) {
        await sendDiscordMessage(removedMessages.join('\n\n'));
        console.log('Change detected!');
      } else {
        console.log('No removals.');
      }
    } else {
      console.log('First run, saving state...');
    }

    saveState(currentState);
    console.log('Process completed successfully.');
  } catch (err: any) {
    console.error('Error:', (err as Error).message);
  }
};

main();