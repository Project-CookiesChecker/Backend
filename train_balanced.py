import mysql.connector
from sklearn.model_selection import train_test_split
import torch
from torch.utils.data import Dataset
from transformers import AutoTokenizer, AutoModelForSequenceClassification, TrainingArguments, Trainer
import numpy as np
from sklearn.metrics import accuracy_score, f1_score

MYSQL_HOST = "localhost"
MYSQL_USER = "root"
MYSQL_PASSWORD = ""
MYSQL_DB = "cookies_db"

LABEL2ID = {
    "Strictly Necessary Cookies": 0,
    "Performance Cookies": 1,
    "Functionality Cookies": 2,
    "Targeting or Advertising Cookies": 3,
}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}

PRETRAINED = "distilbert-base-uncased"
SAVE_DIR = "./hf_cookie_model_balanced" 

class CookieDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_len=64):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __getitem__(self, idx):
        enc = self.tokenizer(self.texts[idx], truncation=True, padding="max_length", max_length=self.max_len)
        enc = {k: torch.tensor(v) for k, v in enc.items()}
        enc["labels"] = torch.tensor(self.labels[idx])
        return enc

    def __len__(self):
        return len(self.texts)

def load_balanced_data(limit_per_class=90000):
    print(f"[INFO] processing {limit_per_class} class to avoid Class Imbalance...")
    texts, labels = [], []
    try:
        conn = mysql.connector.connect(host=MYSQL_HOST, user=MYSQL_USER, password=MYSQL_PASSWORD, database=MYSQL_DB)
        cursor = conn.cursor(dictionary=True)
        
        # ใช้ UNION ALL เพื่อดึงข้อมูลแต่ละ Label มาเท่าๆ กัน
        queries = []
        for label_text in LABEL2ID.keys():
            queries.append(f"(SELECT name, domain, label FROM cookies WHERE label = '{label_text}' LIMIT {limit_per_class})")
        
        final_query = " UNION ALL ".join(queries)
        cursor.execute(final_query)
        rows = cursor.fetchall()
        
        for row in rows:
            text = f"{row['name']} | {row['domain']}"
            texts.append(text)
            labels.append(LABEL2ID[row['label']])
            
    except Exception as e:
        print("MySQL error:", e)
    finally:
        if 'conn' in locals() and conn.is_connected():
            conn.close()

    print(f"[INFO] Received data: {len(texts)} samples")
    return texts, labels

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    return {
        "accuracy": accuracy_score(labels, preds),
        "f1_macro": f1_score(labels, preds, average="macro")
    }

def main():
    # 1. โหลดข้อมูลแบบ Balanced 
    texts, labels = load_balanced_data(limit_per_class=90000)
    
    if len(texts) == 0:
        print("[ERROR] Could not load any data. Please check your MySQL connection and data.")
        return

    # 2. แบ่งข้อมูล Train 80% / Test 20%
    X_train, X_val, y_train, y_val = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    print("[INFO] Loading Model & Tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(PRETRAINED)
    model = AutoModelForSequenceClassification.from_pretrained(
        PRETRAINED, num_labels=len(LABEL2ID), id2label=ID2LABEL, label2id=LABEL2ID
    )

    train_ds = CookieDataset(X_train, y_train, tokenizer)
    val_ds = CookieDataset(X_val, y_val, tokenizer)

    # 3. ตั้งค่าการเทรน 
    args = TrainingArguments(
        output_dir=SAVE_DIR,
        num_train_epochs=2,
        per_device_train_batch_size=32,
        per_device_eval_batch_size=64,
        eval_strategy="epoch",
        save_strategy="epoch", 
        logging_steps=500,
        load_best_model_at_end=True
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        processing_class=tokenizer, 
        compute_metrics=compute_metrics
    )

    print("[INFO] Start training ...")
    trainer.train()
    
    print("[INFO] Final Evaluation...")
    metrics = trainer.evaluate()
    print("\n" + "="*50)
    print(f"Accuracy : {metrics['eval_accuracy']*100:.2f}%")
    print(f"F1 Score (Macro)      : {metrics['eval_f1_macro']*100:.2f}%")
    print("="*50)

    trainer.save_model(SAVE_DIR)
    tokenizer.save_pretrained(SAVE_DIR)
    print(f"[DONE] Model Saved → {SAVE_DIR}")

if __name__ == "__main__":
    main()