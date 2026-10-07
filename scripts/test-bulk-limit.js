const tasks = [];

for (let i = 1; i <= 501; i++) {
    tasks.push({
        title: `Bulk Limit Test ${i}`,
        description: "Testing maximum bulk task limit",
        scheduledAt: "2026-09-18T10:00:00.000Z",
        assignedToId: "e8ecac71-d6af-4576-9965-acb381173430",
        siteId: "9898005c-aa78-4cdc-91fa-16a27d42176e",
        priority: "MEDIUM",
    });
}

console.log(JSON.stringify({ tasks }, null, 2));