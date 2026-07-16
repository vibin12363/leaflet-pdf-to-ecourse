from motor.motor_asyncio import AsyncIOMotorClient
from . import config

_client = AsyncIOMotorClient(config.MONGODB_URI)
db = _client[config.DB_NAME]

users = db.users
documents = db.documents
courses = db.courses
lessons = db.lessons          # generated lesson content (lazy cache)
progress = db.progress
chats = db.chats
quizzes = db.quizzes
quiz_attempts = db.quiz_attempts
