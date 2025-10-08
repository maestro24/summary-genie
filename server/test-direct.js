
// test-direct.js
const { MongoClient } = require('mongodb');

// Atlas에서 복사한 전체 연결 문자열 붙여넣기
const uri = "mongodb+srv://haeseong050321:<db_password>@badaai-cluster.gpsqaku.mongodb.net/";

MongoClient.connect(uri)
  .then(client => {
    console.log('✅ 연결 성공!');
    client.close();
  })
  .catch(err => {
    console.log('❌ 실패:', err.message);
  });