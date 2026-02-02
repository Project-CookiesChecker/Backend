import os
import torch
import joblib
import numpy as np
from transformers import BertTokenizer, BertModel
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import LabelEncoder

# 1. ตั้งค่าและสร้างโฟลเดอร์
MODEL_PATH = './saved_model/'
if not os.path.exists(MODEL_PATH):
    os.makedirs(MODEL_PATH)

print("Downloading BERT Model (This may take a while)...")
# ใช้ Model ภาษาขนาดเล็กเพื่อความรวดเร็ว (bert-base-uncased)
tokenizer = BertTokenizer.from_pretrained('bert-base-uncased')
model = BertModel.from_pretrained('bert-base-uncased')

# 2. ข้อมูลตัวอย่างสำหรับสอน (Mock Data)
# เพื่อให้ AI พอจะรู้จักคุกกี้พื้นฐานบ้าง
data = [
    ("session_id | .example.com", "Strictly Necessary Cookies"),
    ("__cf_bm | .cloudflare.com", "Strictly Necessary Cookies"),
    ("auth_token | .mysite.com", "Strictly Necessary Cookies"),
    
    ("_ga | .google.com", "Performance Cookies"),
    ("_gid | .google.com", "Performance Cookies"),
    ("gat | .google.com", "Performance Cookies"),
    
    ("lang | .website.com", "Functionality Cookies"),
    ("theme | .website.com", "Functionality Cookies"),
    ("timezone | .website.com", "Functionality Cookies"),
    
    ("fbp | .facebook.com", "Targeting or Advertising Cookies"),
    ("ads_prefs | .doubleclick.net", "Targeting or Advertising Cookies"),
    ("test_cookie | .doubleclick.net", "Targeting or Advertising Cookies")
]

texts = [item[0] for item in data]
labels = [item[1] for item in data]

# 3. แปลง Label เป็นตัวเลข
print("Processing Data...")
le = LabelEncoder()
y = le.fit_transform(labels)

# 4. แปลงข้อความ เป็น Embedding (Vector)
def get_embedding(text):
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=128)
    with torch.no_grad():
        outputs = model(**inputs)
    return outputs.last_hidden_state[:, 0, :].numpy()

X = []
for text in texts:
    X.append(get_embedding(text)[0])
X = np.array(X)

# 5. สร้างและสอน Classifier 
print("Training Classifier...")
clf = MLPClassifier(hidden_layer_sizes=(64,), max_iter=500, random_state=42)
clf.fit(X, y)

# 6. บันทึกไฟล์ทั้งหมดลงโฟลเดอร์
print(f"Saving models to {MODEL_PATH}...")

# บันทึก BERT (Tokenizer & Model)
tokenizer.save_pretrained(MODEL_PATH)
model.save_pretrained(MODEL_PATH)

# บันทึก Classifier & Label Encoder
joblib.dump(clf, os.path.join(MODEL_PATH, 'clf_model.pkl'))
joblib.dump(le, os.path.join(MODEL_PATH, 'label_encoder.pkl'))

print("DONE!")