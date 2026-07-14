import sqlite3
def check():
    conn = sqlite3.connect('c:/Users/opole/Downloads/ChatBotn/backend/db/sql_app.db')
    c = conn.cursor()
    c.execute("UPDATE canvas_things SET rag_status='failed' WHERE id='71c23693-3772-4399-92ca-184d7a85b3da'")
    conn.commit()
    print("Done")

if __name__ == '__main__':
    check()
