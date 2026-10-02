const pool = require("../../db/db");
const service = require("./service");

function explicitUserId(argv, env) {
  let fromArg = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--user-id") {
      fromArg = argv[index + 1] || "";
    }
  }
  const fromEnv = env.BOOTSTRAP_ADMIN_USER_ID;
  if (fromArg && fromEnv && fromArg !== fromEnv) {
    return { error: "user id arguments disagree" };
  }
  const userId = fromArg || fromEnv || "";
  if (!userId) {
    return { error: "user id is required" };
  }
  return { userId };
}

async function main() {
  const identified = explicitUserId(process.argv.slice(2), process.env);
  if (identified.error) {
    console.error(identified.error);
    return 1;
  }
  const result = await service.bootstrapFirstAdministrator(identified.userId);
  if (result.status === 201) {
    console.log(JSON.stringify({ status: result.status, assignment_id: result.body.assignment.id }));
    return 0;
  }
  console.error(result.body.error);
  return 1;
}

if (require.main === module) {
  main()
    .then(async (code) => {
      await pool.end();
      process.exit(code);
    })
    .catch(async (err) => {
      console.error(err.message);
      await pool.end();
      process.exit(1);
    });
}

module.exports = {
  explicitUserId,
};
