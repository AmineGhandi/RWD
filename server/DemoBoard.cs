namespace Rwd;
public static class DemoBoard
{
    public static void Populate(Room room) {
        string[] names = ["Movies", "Gaming", "Morocco", "Friend lore", "Random"];
        (string Text, string Answer)[][] clues = [
            [("Which movie features the line “I’ll be back”?", "The Terminator"), ("What is the name of the cowboy in Toy Story?", "Woody"), ("Which fictional school does Harry Potter attend?", "Hogwarts"), ("Who directed Jurassic Park (1993)?", "Steven Spielberg"), ("In The Matrix, which pill does Neo take?", "The red pill")],
            [("Which plumber is Nintendo’s mascot?", "Mario"), ("Which game has Creepers and crafting tables?", "Minecraft"), ("What does NPC stand for?", "Non-player character"), ("In chess, which piece can jump over other pieces?", "The knight"), ("What is the fictional continent in The Elder Scrolls called?", "Tamriel")],
            [("What is Morocco’s capital city?", "Rabat"), ("Which Moroccan city is known for its blue streets?", "Chefchaouen"), ("What is the traditional Moroccan pot with a conical lid called?", "A tagine"), ("Which ocean borders Morocco to the west?", "The Atlantic Ocean"), ("What is the name of the mountain range containing Mount Toubkal?", "The Atlas Mountains")],
            [("Who in this group is always late?", "Host: choose your group’s answer before starting."), ("What is the group’s most-used catchphrase?", "Host: add your group’s catchphrase."), ("Where did the group first meet?", "Host: add your meeting place."), ("What was the group’s funniest trip moment?", "Host: add your favourite story."), ("Who is the reigning game-night champion?", "Host: add your champion’s name.")],
            [("How many sides does a hexagon have?", "Six"), ("What planet is known as the Red Planet?", "Mars"), ("What is the chemical symbol for gold?", "Au"), ("What is the largest ocean on Earth?", "The Pacific Ocean"), ("How many bones are in a typical adult human skeleton?", "206")]
        ];
        for (var c = 0; c < names.Length; c++) {
            var id = $"c{c}"; room.Categories.Add(new(id, names[c]));
            for (var row = 0; row < 5; row++) room.Questions.Add(new($"q{c}-{row}", id, (row + 1) * 100, clues[c][row].Text, clues[c][row].Answer));
        }
    }
}
