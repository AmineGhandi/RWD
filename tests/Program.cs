using Rwd;
var store = new GameStore();
var host = store.Create();
var a = store.Join(host.Code, "Amine");
var b = store.Join(host.Code, "Sara");
var room = store.Attach(host.Code, "host", host.Token, "host");
store.Attach(host.Code, "player", a.Token, "a");
store.Attach(host.Code, "player", b.Token, "b");
store.Attach(host.Code, "display", "", "display");
int passed = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception("FAIL: " + name); passed++; Console.WriteLine("PASS: " + name); }
void Reject(Action action, string name) { try { action(); } catch (GameException) { Check(true, name); return; } throw new Exception("FAIL: " + name); }
void Act(string kind, bool? correct = null, string? question = null) => store.Act(room, "host", new(kind, question, room.RoundId, room.AttemptId, correct));
Reject(() => store.Attach(host.Code, "host", a.Token, "fakehost"), "player credentials cannot become host");
Reject(() => store.Act(room, "a", new("start")), "player cannot issue host commands");
Check(store.View(room, false).Questions.All(q => q.Text == null && q.Answer == null), "unselected questions and all answers stay private");
Check(store.View(room, true).Questions.All(q => q.Answer != null), "host can see answers");
Act("start"); Act("select", question: "q0-0");
Check(!store.Buzz(room, "a", room.RoundId), "buzzers locked before opening");
Act("open");
var results = await Task.WhenAll(Enumerable.Range(0, 100).Select(i => Task.Run(() => store.Buzz(room, i % 2 == 0 ? "a" : "b", room.RoundId))));
Check(results.Count(won => won) == 1, "100 simultaneous buzzes yield exactly one winner");
var loserConnection = room.WinnerId == a.PlayerId ? "b" : "a";
var winnerConnection = loserConnection == "a" ? "b" : "a";
var winnerId = room.WinnerId;
var attempt = room.AttemptId;
Act("judge", correct: false);
Check(store.View(room, false).Players.Single(p => p.Id == winnerId).Score == -100, "wrong answer subtracts the question value");
Reject(() => store.Act(room, "host", new("judge", RoundId: room.RoundId, AttemptId: attempt, Correct: false)), "duplicate judgement rejected");
Check(store.View(room, false).Questions.All(q => q.Answer == null), "wrong-answer state does not reveal answer");
Act("undo");
Check(store.View(room, false).Players.All(p => p.Score == 0) && room.Phase == "answering", "undo restores score and answering state");
Reject(() => store.Act(room, "host", new("judge", RoundId: room.RoundId, AttemptId: attempt, Correct: true)), "undo invalidates stale judgement attempt");
Act("judge", correct: false); Act("open");
Check(!store.Buzz(room, loserConnection, "old-round"), "stale buzz rejected");
Check(store.Buzz(room, winnerConnection, room.RoundId), "player who answered wrong can buzz again after reopening");
Act("judge", correct: false);
Check(store.View(room, false).Players.Single(p => p.Id == winnerId).Score == -200, "answering wrong again subtracts points again");
Act("open");
Check(store.Buzz(room, loserConnection, room.RoundId), "another player can buzz after reopening");
Act("judge", correct: true);
Check(store.View(room, false).Questions.All(q => q.Answer == null), "correct judgement keeps answer private until reveal");
Act("reveal");
Check(store.View(room, false).Questions.Single(q => q.Id == "q0-0").Answer == "The Terminator", "reveal publishes only the selected answer");
Check(store.View(room, false).Questions.Where(q => q.Id != "q0-0").All(q => q.Answer == null && q.Text == null), "unplayed clues remain private after reveal");
var before = store.View(room, false).Players.Single(p => p.Id == a.PlayerId).Score;
store.Detach("a");
Check(!store.View(room, false).Players.Single(p => p.Id == a.PlayerId).Connected, "disconnect updates presence");
store.Attach(host.Code, "player", a.Token, "a-new");
Check(store.View(room, false).Players.Single(p => p.Id == a.PlayerId).Score == before, "reconnect preserves identity and score");
Act("board"); Act("select", question: "q1-0"); Act("open");
lock(room.Gate) room.Deadline = DateTimeOffset.UtcNow.AddSeconds(-1);
Check(!store.Buzz(room, "a-new", room.RoundId) && room.Phase == "expired", "server rejects a buzz after its deadline");
Act("reveal"); Act("board");
Reject(() => Act("select", question: "q0-0"), "played question cannot be selected twice");
store.Act(room, "host", new("edit", Edit: new("q0-1", "Updated custom text", "Updated custom answer")));
Act("lobby");
Check(room.Phase == "lobby", "returning to lobby resets phase to lobby");
Check(store.View(room, true).Questions.Single(q => q.Id == "q0-1").Text == "Updated custom text", "edited questions remain intact when returning to lobby");
Check(store.View(room, false).Questions.All(q => !q.Played), "all questions are unplayed after returning to lobby");
Check(store.View(room, false).Players.All(p => p.Score == 0), "scores reset after returning to lobby");

// Test import_board
var importedCats = new List<ImportedCategory> { new("c0", "Custom Cat 1"), new("c1", "Custom Cat 2") };
var importedQs = new List<ImportedQuestion> {
    new("q0-0", "c0", 100, "Imported Q1", "Imported A1"),
    new("q1-0", "c1", 200, "Imported Q2", "Imported A2")
};
store.Act(room, "host", new("import_board", Board: new(importedCats, importedQs)));
var importedView = store.View(room, true);
Check(importedView.Categories.Length == 2 && importedView.Categories[0].Name == "Custom Cat 1", "board import replaces categories");
Check(importedView.Questions.Length == 2 && importedView.Questions[0].Text == "Imported Q1", "board import replaces questions");

// --- JBTI RB7A (Wager round) tests ---
Act("start"); // Move to board
// 1. Initiate wager round assigning a specific question (e.g. q1-0)
store.Act(room, "host", new("wager_init", QuestionId: "q1-0"));
var wagerSetupView = store.View(room, false);
Check(room.Phase == "wager_setup", "wager_init transitions to wager_setup");
Check(wagerSetupView.Wager is not null && !wagerSetupView.Wager.Locked, "wager state exists and is unlocked in setup");
Check(room.QuestionId == "q1-0", "wager_init assigns the specified question");
Check(wagerSetupView.Questions.Single(q => q.Id == "q1-0").Text == null, "reserved question text is hidden from players during wager_setup");
Check(store.View(room, true).Questions.Single(q => q.Id == "q1-0").Text != null, "assigned question text is visible to host during wager_setup");

// 2. Host reassigns the question to another specific question during setup
store.Act(room, "host", new("wager_question", QuestionId: "q0-0"));
Check(room.QuestionId == "q0-0", "wager_question reassigns the specific question");

// 3. Cancellation releases the reserved question without marking it played
store.Act(room, "host", new("wager_cancel"));
Check(room.Phase == "board" && room.QuestionId == null && room.Wager == null, "wager_cancel returns to board and clears wager");
Check(!store.View(room, false).Questions.Single(q => q.Id == "q0-0").Played, "cancelled question remains unplayed");

// 4. Re-initiate and test input validation
store.Act(room, "host", new("wager_init", QuestionId: "q0-0", PlayerId: a.PlayerId));
var activeReservedQId = "q0-0";
Reject(() => store.Act(room, "host", new("wager_lock", PlayerId: a.PlayerId, WagerAmount: 0)), "rejects 0 wager");
Reject(() => store.Act(room, "host", new("wager_lock", PlayerId: a.PlayerId, WagerAmount: -50)), "rejects negative wager");
Reject(() => store.Act(room, "host", new("wager_lock", PlayerId: "nonexistent", WagerAmount: 500)), "rejects invalid player id");
Reject(() => store.Act(room, "host", new("wager_lock", PlayerId: a.PlayerId)), "rejects missing wager amount");

// Switch participant in setup
store.Act(room, "host", new("wager_player", PlayerId: b.PlayerId));
Check(store.View(room, false).Wager!.PlayerId == b.PlayerId, "wager_player updates selected participant");

// Lock wager with valid amount (e.g. 750) and assigned question
store.Act(room, "host", new("wager_lock", PlayerId: b.PlayerId, WagerAmount: 750, QuestionId: "q0-0"));
var lockedView = store.View(room, false);
Check(room.Phase == "reading", "wager_lock transitions to reading");
Check(lockedView.Wager is not null && lockedView.Wager.Locked && lockedView.Wager.Amount == 750, "wager is locked with specified amount");
Check(lockedView.Questions.Single(q => q.Id == activeReservedQId).Text != null, "question text is revealed to players once wager is locked");
Check(lockedView.Questions.Single(q => q.Id == activeReservedQId).Answer == null, "question answer remains private once wager is locked");
Check(room.QuestionId == activeReservedQId, "locked question matches reserved question");

// 4. Other players cannot buzz during wager round
Act("open");
Check(!store.Buzz(room, "a-new", room.RoundId), "other player cannot buzz during wager round");
Check(store.Buzz(room, "b", room.RoundId), "selected participant can buzz during wager round");
Check(room.Phase == "answering" && room.WinnerId == b.PlayerId, "selected participant has floor");

// 5. Duplicate judgment protection & scoring exactly once
var wagerAttempt = room.AttemptId;
var bScoreBefore = store.View(room, false).Players.Single(p => p.Id == b.PlayerId).Score;
Act("judge", correct: false);
var bScoreAfterWrong = store.View(room, false).Players.Single(p => p.Id == b.PlayerId).Score;
Check(bScoreAfterWrong == bScoreBefore - 750, "wrong answer subtracts the wager amount (750), ignoring tile value");
Reject(() => store.Act(room, "host", new("judge", RoundId: room.RoundId, AttemptId: wagerAttempt, Correct: false)), "duplicate click/judgement rejected in wager round");

// 6. Undo judgment restores score and unmarks played
Act("undo");
Check(store.View(room, false).Players.Single(p => p.Id == b.PlayerId).Score == bScoreBefore, "undo restores previous score in wager round");
Check(room.Phase == "answering", "undo returns phase to answering");

// Re-judge correct
Act("judge", correct: true);
var bScoreAfterCorrect = store.View(room, false).Players.Single(p => p.Id == b.PlayerId).Score;
Check(bScoreAfterCorrect == bScoreBefore + 750, "correct answer adds the wager amount (750)");
Check(store.View(room, false).Questions.Single(q => q.Id == activeReservedQId).Played, "question is marked played after resolution");

// 7. Finish round and return to board
Act("reveal");
Act("board");
Check(room.Phase == "board" && room.Wager == null, "returning to board clears wager round");

store.Remove(host.Code);
Reject(() => store.Get(host.Code), "deleted room cannot be retrieved");
Console.WriteLine($"{passed} checks passed.");
