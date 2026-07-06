import {
  adoptRepoPortOwners,
  inspectPorts,
  stopRecordedProcesses
} from "./axi-dev-utils.mjs";

const adopt = process.argv.includes("--adopt-repo-processes");
const stopped = await stopRecordedProcesses();

if (stopped.length > 0) {
  console.log(`Stopped ${stopped.length} recorded local AXI process(es).`);
} else {
  console.log("No recorded local AXI processes were running.");
}

const ports = await inspectPorts();
const repoLocalOwners = ports.filter((item) => item.owner?.repoLocal);
const unknownOwners = ports.filter((item) => item.owner && !item.owner.repoLocal);

if (adopt && repoLocalOwners.length > 0) {
  const adopted = await adoptRepoPortOwners();
  console.log(`Stopped ${adopted.length} repo-local port owner(s).`);
} else {
  for (const item of repoLocalOwners) {
    console.warn(
      `${item.name} port ${item.port} still has a repo-local owner. Run pnpm axi:stop --adopt-repo-processes to stop it.`
    );
  }
}

for (const item of unknownOwners) {
  console.warn(
    `${item.name} port ${item.port} is owned by an unknown process; leaving it alone.`
  );
}
