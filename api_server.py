from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import torch
from transformers import BertTokenizer, BertModel
import joblib
import numpy as np
from neo4j import GraphDatabase

app = Flask(__name__)
# อนุญาต CORS ทุกกรณีเพื่อป้องกันปัญหาการเชื่อมต่อ
CORS(app, resources={r"/*": {"origins": "*"}})

# ==========================================
# 1. CONFIGURATION
# ==========================================

# Database MySQL 
MYSQL_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',      
    'database': 'cookies_db'
}

# Neo4j Aura Config (Cloud)
NEO4J_URI = "neo4j+s://6de2c581.databases.neo4j.io" 
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "Vj47n2DOiNqTBDvfz7fSkj_OPd7ZH30QZSzdfNKKSxA"

# Initialize Neo4j Driver
driver = None
try:
    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    driver.verify_connectivity()
    print("[SYSTEM] Neo4j Aura Connected Successfully!")
except Exception as e:
    print(f"[ERROR] Neo4j Connection Failed: {e}")

# ==========================================
# 2. AI MODEL LOADING
# ==========================================
print("[SYSTEM] Loading AI Models...")
try:
    tokenizer = BertTokenizer.from_pretrained('./saved_model/')
    model = BertModel.from_pretrained('./saved_model/')
    clf = joblib.load('./saved_model/clf_model.pkl')
    le = joblib.load('./saved_model/label_encoder.pkl')
    
    ID2LABEL = {i: label for i, label in enumerate(le.classes_)}
    print("[SYSTEM] AI Models Loaded Successfully!")

except Exception as e:
    print(f"[ERROR] Loading Model: {e}")
    ID2LABEL = {0: "Unknown"}

def get_embedding(text):
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=128)
    with torch.no_grad():
        outputs = model(**inputs)
    return outputs.last_hidden_state[:, 0, :].numpy()


# ==========================================
# 3. NEO4J FUNCTION
# ==========================================

def push_to_neo4j(source_site, tracker_domain, label):
    if not tracker_domain: return
    if not source_site or source_site == "Unknown": source_site = "Unknown_Source"
    
    # แก้ชื่อ Extension ยาวๆ
    if len(source_site) == 32 and "." not in source_site:
        source_site = "Browser Extension"

    if source_site == tracker_domain: return

    print(f"[DEBUG] Graph Plotting: {source_site} -> {tracker_domain} ({label})")

    if driver:
        try:
            with driver.session() as session:
                query = """
                MERGE (s:Website {name: $site})
                MERGE (t:Tracker {name: $tracker})
                MERGE (s)-[r:SENDS_DATA_TO]->(t)
                SET r.type = $cookie_type, r.last_seen = datetime()
                """
                session.run(query, site=source_site, tracker=tracker_domain, cookie_type=label)     
            print(f"[SUCCESS] Graph Updated: {source_site} -> {tracker_domain}")
        except Exception as e:
            print(f"[ERROR] Neo4j Error: {e}")


# ==========================================
# 4. API ROUTES 
# ==========================================

@app.route('/', methods=['GET'])
def home():
    return "CookiesChecker API is Running!"

@app.route('/history', methods=['GET'])
def get_history():
    try:
        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)
        sql = "SELECT domain, GROUP_CONCAT(DISTINCT label SEPARATOR ', ') as labels FROM cookies GROUP BY domain ORDER BY MAX(id) DESC LIMIT 20"
        cursor.execute(sql)
        rows = cursor.fetchall()
        conn.close()
        return jsonify(rows)
    except Exception as e:
        return jsonify([])

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        name = data.get('name', '')
        domain = data.get('domain', '')
        source_site = data.get('source_site', 'Unknown_Source') 

        conn = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT label FROM cookies WHERE name=%s AND domain=%s LIMIT 1", (name, domain))
        result = cursor.fetchone()

        label = "Unknown"
        source = "ai_model"

        if result and result['label']:
            label = result['label']
            source = "database"
        else:
            try:
                text = f"{name} | {domain}"
                embedding = get_embedding(text)
                pred_id = clf.predict(embedding)[0]
                label = ID2LABEL[int(pred_id)]
            except:
                label = "Unknown"

            sql = "INSERT INTO cookies (name, domain, label, label_source) VALUES (%s, %s, %s, 'ai_predicted') ON DUPLICATE KEY UPDATE label=%s"
            cursor.execute(sql, (name, domain, label, label))
            conn.commit()
        
        conn.close()

        # Send to Neo4j
        push_to_neo4j(source_site, domain, label)

        return jsonify({"source": source, "label": label})

    except Exception as e:
        print(f"[ERROR] Server Error: {e}")
        return jsonify({"source": "error", "label": "Unknown"})

@app.route('/graph-data', methods=['GET'])
def get_graph_data():
    try:
        # กลับมาใช้ Query แบบเดิม (ดึงรวม)
        query = """
        MATCH (n)-[r]->(m)
        RETURN n, r, m LIMIT 100
        """
        
        nodes = []
        edges = []
        node_ids = set()

        if driver:
            with driver.session() as session:
                result = session.run(query)
                for record in result:
                    n = record['n']
                    m = record['m']
                    r = record['r']

                    if n.element_id not in node_ids:
                        nodes.append({
                            "id": n.element_id,
                            "label": n.get("name", "Unknown"),
                            "group": "website" if "Website" in n.labels else "tracker"
                        })
                        node_ids.add(n.element_id)

                    if m.element_id not in node_ids:
                        nodes.append({
                            "id": m.element_id,
                            "label": m.get("name", "Unknown"),
                            "group": "website" if "Website" in m.labels else "tracker"
                        })
                        node_ids.add(m.element_id)

                    edges.append({
                        "from": n.element_id,
                        "to": m.element_id,
                        "label": r.get("type", "LINK"),
                        "arrows": "to"
                    })

        return jsonify({"nodes": nodes, "edges": edges})

    except Exception as e:
        print(f"[ERROR] Get Graph Failed: {e}")
        return jsonify({"nodes": [], "edges": []})

if __name__ == '__main__':
    try:
        app.run(host='0.0.0.0', port=5000, threaded=True)
    finally:
        if driver:
            driver.close()