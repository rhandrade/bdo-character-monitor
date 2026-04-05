import axios from 'axios';
import * as cheerio from 'cheerio';
import 'dotenv/config'; 
import { dirname } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const URL: string = process.env.ADVENTURER_URL || "";
const DISCORD_WEBHOOK: string = process.env.DISCORD_WEBHOOK_URL || "";
const STATE_FILE: string = "./data/state.json";

const sendDiscordMessage = async (message: string): Promise<any> => {
  try {
    console.log("Sending Discord message...");
    await axios.post(DISCORD_WEBHOOK, {
      content: message,
    });
    console.log("Discord message sent!");
  } catch (err) {
    console.error("Error when sending Discord message:", (err as Error).message);
  }
}

const getAdventurerInfo = async (): Promise<string[]> => {
  const response = await axios.get(URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  const $ = cheerio.load(response.data as string);

  const personagens: string[] = [];

  $(".character_name").each((i, el) => {
    const fullText = $(el).text().trim();
    const labelText = $(el).find('.selected_label').text().trim();
    const text = fullText.replace(labelText, '').trim();
    if (text) {
      personagens.push(text);
    }
  });

  return personagens;
}

const loadCurrentState = (): string[] | null => {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  }
  return null;
}

const saveState = (data: string[]): void => {
  mkdirSync(dirname(STATE_FILE), { recursive: true });  
  writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

const main = async () => {
  try {
    console.log("Starting adventurer info monitoring...");

    if(!URL || !DISCORD_WEBHOOK) {
      throw new Error("Environment variables not set.");
    }

    const current: string[] = await getAdventurerInfo();
    // const current: string[]= [];
    const previous: string[] | null = loadCurrentState();

    console.log("Current characters:", current);

    if (previous) {
      if (current.length < previous.length) {
        const removed: string[] = previous.filter(p => !current.includes(p));

        const msg: string = `Removed Character!\nRemoved: ${removed.join(", ")}\nBefore: ${previous.length} | Now: ${current.length}`;
        await sendDiscordMessage(msg);

        console.log("Change detected!");
      } else {
        console.log("No removals.");
      }
    } else {
      console.log("First run, saving state...");
    }

    saveState(current);
    console.log("Process completed successfully.");
  } catch (err: any) {
    console.error("Error:", (err as Error).message);
  }
};

main();