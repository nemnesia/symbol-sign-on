// 以下でログインして実行する
// docker exec -it compose-mongo1-1 mongosh
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "172.19.250.241:27017" }, // WSL2のIP
    { _id: 1, host: "172.19.250.241:27018" },
    { _id: 2, host: "172.19.250.241:27019" }
  ]
});
