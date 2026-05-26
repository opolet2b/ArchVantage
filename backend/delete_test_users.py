import sqlite3

def delete_users():
    conn = sqlite3.connect('db/sql_app.db')
    cursor = conn.cursor()
    emails_to_delete = [
        'toto@toto.com',
        'tata@tata.com',
        'titi@titi.com',
        'toto@toto.cmo'
    ]
    
    try:
        # Delete from user_roles first to prevent FK constraint issues
        for email in emails_to_delete:
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            row = cursor.fetchone()
            if row:
                user_id = row[0]
                cursor.execute("DELETE FROM user_roles WHERE user_id = ?", (user_id,))
                cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
                print(f"Deleted {email}")
            else:
                print(f"User {email} not found")
        conn.commit()
        print("Deletion complete.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    delete_users()
