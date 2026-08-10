import { ActionRepository } from "./action-repository.js";
import { config } from "./config.js";
import { openDatabase } from "./database.js";
import { McpTokenRepository } from "./mcp-token-repository.js";

const [command, ...argumentsList] = process.argv.slice(2);
const database = openDatabase(config.databasePath, config.migrationsDirectory);

try {
  const actions = new ActionRepository(database);
  const credentials = new McpTokenRepository(database);
  const email = option(argumentsList, "--email");
  const user = actions.findUserByEmail(email);
  if (!user) throw new Error(`No Organization account exists for ${email}.`);

  if (command === "create") {
    const name = option(argumentsList, "--name");
    const created = credentials.create(user.id, name);
    console.log(created.token);
  } else if (command === "list") {
    console.log(JSON.stringify(credentials.list(user.id), null, 2));
  } else if (command === "revoke") {
    const id = option(argumentsList, "--id");
    console.log(JSON.stringify(credentials.revoke(user.id, id), null, 2));
  } else {
    throw new Error("Usage: mcp-token <create|list|revoke> --email <email> [--name <name> | --id <id>]");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  database.close();
}

function option(argumentsList: string[], name: string) {
  const index = argumentsList.indexOf(name);
  const value = index >= 0 ? argumentsList[index + 1]?.trim() : "";
  if (!value) throw new Error(`Missing required option ${name}.`);
  return value;
}
