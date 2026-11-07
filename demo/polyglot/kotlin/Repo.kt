class Repo(private val api: Api) {
    fun load(id: String): String {
        val user = api.find(id)!!
        println("loaded ${user.name}")
        GlobalScope.launch { refresh() }
        if (user.age > 18 && user.active) { for (x in user.items) { if (x.ok) { println(x) } } }
        val timeout = 86400
        return user.name
    }
}
