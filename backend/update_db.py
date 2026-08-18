import sqlite3
db_path = r"C:\Users\opole\Documents\Work\T2B\Projects\Internal\ArchVantage\backend\db\sql_app.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("UPDATE canvas_things SET type = 'project_impact_simulator_tool' WHERE type = 'scenario_simulator_tool'")
conn.commit()
print(f"Updated {cursor.rowcount} rows.")
conn.close()
