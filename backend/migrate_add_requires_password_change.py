import sqlite3

def migrate():
    conn = sqlite3.connect('db/sql_app.db')
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN requires_password_change BOOLEAN DEFAULT 0;")
        conn.commit()
        print("Migration successful.")
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
