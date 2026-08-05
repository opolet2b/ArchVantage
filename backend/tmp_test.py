from app.core.arcadedb import arcadedb
res = arcadedb.query('SELECT @type, count(*) FROM Entity WHERE graph_id = "dada2286-5039-46a4-ae5d-d65c747a7405" GROUP BY @type')
print(res.get('result'))
